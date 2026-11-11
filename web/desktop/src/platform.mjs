import { app, BrowserWindow, dialog, session, safeStorage } from 'electron';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { APP_ORIGIN, isAuthUrl, isHttps, ruleHeaders } from './policy.mjs';

class Signal {
  listeners = new Set();
  addListener = (fn) => { this.listeners.add(fn); };
  removeListener = (fn) => { this.listeners.delete(fn); };
  emit = (...args) => { for (const fn of this.listeners) fn(...args); };
}

const dynamicRules = new Map();
const sessionRules = new Map();
let services, ownerWindow, onEvent, discordConnect;
let stored;
const authWindows = new Map();
const storageChanged = new Signal();
const cookiesChanged = new Signal();
const runtime = Object.fromEntries(['onInstalled', 'onStartup', 'onMessage', 'onMessageExternal', 'onConnect', 'onConnectExternal']
  .map(name => [name, new Signal()]));
const updateRules = (map, changes) => {
  for (const id of changes.removeRuleIds ?? []) map.delete(id);
  for (const rule of changes.addRules ?? []) map.set(rule.id, rule);
};

function loadStorage() {
  if (stored) return stored;
  const file = path.join(app.getPath('userData'), 'integrations.dat');
  if (!existsSync(file)) return (stored = {});
  // Never fall back to plaintext for account material.
  stored = JSON.parse(safeStorage.decryptString(readFileSync(file)));
  return stored;
}

function persist() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows account encryption is unavailable.');
  const file = path.join(app.getPath('userData'), 'integrations.dat');
  writeFileSync(file + '.tmp', safeStorage.encryptString(JSON.stringify(stored)));
  renameSync(file + '.tmp', file);
}

function saveStorage(values, remove = []) {
  const data = loadStorage();
  const changes = {};
  for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: data[key], newValue: value }; data[key] = value; }
  for (const key of remove) { changes[key] = { oldValue: data[key] }; delete data[key]; }
  persist();
  storageChanged.emit(changes, 'local');
}

export function setDesktopHooks({ window, broadcast, connectDiscord }) {
  ownerWindow = window;
  onEvent = broadcast;
  discordConnect = connectDiscord;
}

export function initServices() {
  services = session.fromPartition('persist:bitchord-accounts');
  services.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  services.setPermissionCheckHandler(() => false);
  services.cookies.on('changed', (_e, cookie, cause, removed) => cookiesChanged.emit({ cookie, cause, removed }));
  // The signed-in session is deliberately separate from the player renderer.
  services.setUserAgent(services.getUserAgent().replace(/\s(?:Electron|BitChord[^\s]*)\/[^\s]+/g, ''));
  runtime.onConnect.emit({
    name: 'bitchord-events', sender: { id: 'bitchord-desktop', url: APP_ORIGIN + '/', origin: APP_ORIGIN },
    onDisconnect: new Signal(), disconnect() {}, postMessage(event) { onEvent?.(event); },
  });
  runtime.onStartup.emit();
  return services;
}

export function openAuth(url) {
  if (!isAuthUrl(url)) throw new Error('This sign-in address is not supported.');
  const win = new BrowserWindow({
    width: 1000, height: 780, title: 'BitChord — Sign in', autoHideMenuBar: true,
    parent: ownerWindow, webPreferences: { session: services, nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const id = win.webContents.id;
  authWindows.set(id, win);
  win.on('closed', () => { authWindows.delete(id); if (ownerWindow && !ownerWindow.isDestroyed()) ownerWindow.focus(); });
  win.webContents.on('will-navigate', (event, target) => { if (!isAuthUrl(target)) event.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isAuthUrl(target)) void win.loadURL(target);
    return { action: 'deny' };
  });
  void win.loadURL(url);
  return { id: win.webContents.id };
}

export const browser = {
  runtime: {
    ...runtime, id: 'bitchord-desktop', getURL: (p) => APP_ORIGIN + (p.startsWith('/') ? p : '/' + p),
    getManifest: () => ({ version: '1.9.1-desktop.1' }), getPlatformInfo: async () => ({ os: 'win', arch: 'x86-64' }),
  },
  storage: {
    onChanged: storageChanged,
    local: {
      get: async (keys) => { const data = loadStorage(); return Object.fromEntries((typeof keys === 'string' ? [keys] : keys ?? Object.keys(data)).map(k => [k, data[k]])); },
      set: async (data) => saveStorage(data), remove: async (keys) => saveStorage({}, Array.isArray(keys) ? keys : [keys]),
    },
  },
  cookies: { get: async (filter) => (await services.cookies.get(filter))[0] ?? null, onChanged: cookiesChanged },
  declarativeNetRequest: {
    updateDynamicRules: async (changes) => updateRules(dynamicRules, changes),
    updateSessionRules: async (changes) => updateRules(sessionRules, changes),
  },
  permissions: {
    // Only upstream's fixed lyric/Apple host list reaches this API. The desktop app owns that access.
    contains: async () => true,
  },
  tabs: {
    create: async ({ url }) => {
      if (url === APP_ORIGIN + '/discord.html') {
        void discordConnect?.().catch(error => dialog.showErrorBox('Discord connection', error.message));
        return {};
      }
      return openAuth(url);
    },
    query: async ({ url }) => [...authWindows.entries()].filter(([, w]) => w.webContents.getURL().startsWith(url.replace('*', ''))).map(([id]) => ({ id })),
    remove: async (id) => authWindows.get(id)?.close(),
  },
  scripting: {
    executeScript: async ({ target, func }) => {
      const win = authWindows.get(target.tabId);
      // Used solely by the explicit Connect Discord action, against our own login window.
      if (!win || new URL(win.webContents.getURL()).origin !== 'https://discord.com') throw new Error('Discord sign-in is not ready.');
      return [{ result: await win.webContents.executeJavaScript(`(${func.toString()})()`) }];
    },
  },
};

/** Injected only into the upstream service modules, never into the renderer. */
export async function fetch(input, init = {}) {
  const url = String(input);
  if (!isHttps(url)) throw new Error('The integration requires HTTPS.');
  const headers = ruleHeaders(sessionRules.values(), url, Object.fromEntries(new Headers(init.headers)), 'requestHeaders');
  return services.fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(30_000) });
}

export const defineBackground = (initialize) => initialize;

// Upstream Spotify uses navigator only to report the client platform.
export const navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

export function installPlayerRules(playerSession) {
  const filter = { urls: ['https://*.youtube.com/*', 'https://*.googlevideo.com/*'] };
  playerSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    callback({ requestHeaders: ruleHeaders(dynamicRules.values(), details.url, details.requestHeaders, 'requestHeaders') });
  });
  playerSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const flat = Object.fromEntries(Object.entries(details.responseHeaders ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]));
    const changed = ruleHeaders(dynamicRules.values(), details.url, flat, 'responseHeaders');
    callback({ responseHeaders: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, [v]])) });
  });
}
