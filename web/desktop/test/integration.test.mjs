import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dist = fileURLToPath(new URL('../dist', import.meta.url));

async function boot() {
  const handlers = new Map(), sessions = new Map(), windows = [], requests = [];
  let loaded;
  const ready = new Promise(resolve => { loaded = resolve; });
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, setPath() {}, requestSingleInstanceLock: () => true, quit() {}, isPackaged: false,
    whenReady: () => Promise.resolve(), getPath: () => path.resolve(dist, 'unused-test-profile') });
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options;
      const wc = new EventEmitter();
      Object.assign(wc, { id: windows.length + 1, mainFrame: { url: 'bitchord://app/home' }, send() {}, setWindowOpenHandler: fn => { this.popup = fn; }, isDestroyed: () => false });
      this.webContents = wc; windows.push(this);
    }
    isDestroyed() { return false; }
    loadURL(url) { this.webContents.mainFrame.url = url; loaded(); return Promise.resolve(); }
    show() {}
  }
  const getSession = key => {
    if (!sessions.has(key)) sessions.set(key, {
      protocol: { handle(name, fn) { this.handler = fn; } },
      cookies: { on() {}, get: async () => [] },
      webRequest: { onBeforeSendHeaders(filter, fn) { this.before = fn; }, onHeadersReceived(filter, fn) { this.after = fn; } },
      setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setUserAgent() {}, getUserAgent: () => 'Electron/45.3.0',
      fetch: async (url, init) => { requests.push({ url, init }); return new Response('{"test":true}', { status: 200, headers: { 'content-type': 'application/json' } }); },
    });
    return sessions.get(key);
  };
  const electron = {
    app, BrowserWindow: Window, session: { fromPartition: getSession }, protocol: { registerSchemesAsPrivileged() {} },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, Menu: { buildFromTemplate: v => v, setApplicationMenu() {} },
    shell: { openExternal() {} }, dialog: { showErrorBox: (_title, message) => { throw new Error(message); }, showMessageBox() {} },
    net: { fetch: async () => new Response('<html/>') }, safeStorage: {},
  };
  vm.runInNewContext(readFileSync(path.join(dist, 'main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : require(name), __dirname: dist,
    process: { argv: [], execPath: process.execPath }, module: { exports: {} }, exports: {}, console,
    URL, Headers, Response, AbortSignal, Buffer, crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa,
    setTimeout, clearTimeout, setInterval, clearInterval,
  }, { filename: 'main.cjs' });
  await ready;
  const win = windows[0];
  const sender = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  const request = (method, params = {}) => handlers.get('bitchord:request')(sender, { channel: 'bitchord-bridge', direction: 'to-extension', protocol: 1, id: 'integration', method, params });
  return { request, handlers, sender, windows, sessions, requests };
}

test('built desktop initializes with isolated player/account sessions and serves upstream capabilities', async () => {
  const h = await boot();
  const ping = await h.request('ping');
  assert.equal(ping.ok, true);
  assert.equal(ping.result.version, '1.9.1-desktop.1');
  assert.ok(ping.result.capabilities.includes('yt'));
  assert.ok(ping.result.capabilities.includes('spotify'));
  assert.ok(h.sessions.has('persist:bitchord-accounts'));
  assert.ok(h.sessions.has('persist:bitchord-player'));
  const prefs = h.windows[0].options.webPreferences;
  assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false);
});
test('built bridge refuses calls from a remote document or another frame', async () => {
  const h = await boot();
  const invoke = h.handlers.get('bitchord:request');
  const message = { channel: 'bitchord-bridge', direction: 'to-extension', protocol: 1, id: 'attack', method: 'ping', params: {} };
  await assert.rejects(invoke({ ...h.sender, senderFrame: { url: 'https://example.com' } }, message), /Invalid desktop request/);
  h.sender.senderFrame.url = 'https://example.com';
  await assert.rejects(invoke(h.sender, message), /Invalid desktop request/);
});
test('upstream service handlers retain URL restrictions and set the expected YouTube headers', async () => {
  const h = await boot();
  const denied = await h.request('yt.fetch', { url: 'https://example.com/private' });
  assert.equal(denied.ok, false); assert.equal(denied.error.code, 'forbidden');
  const reply = await h.request('yt.fetch', { url: 'https://www.youtube.com/api/jnn/v1/GenerateIT', method: 'POST', body: '[]' });
  assert.equal(reply.ok, true);
  assert.equal(h.requests.at(-1).init.headers.Origin, 'https://www.youtube.com');
  assert.equal(h.requests.at(-1).init.credentials, 'omit');
});
test('lyric service access is limited to upstream providers', async () => {
  const h = await boot();
  const denied = await h.request('lyrics.fetch', { url: 'https://example.com/private' });
  assert.equal(denied.ok, false); assert.equal(denied.error.code, 'forbidden');
  const reply = await h.request('lyrics.fetch', { url: 'https://lrclib.net/api/search?q=test' });
  assert.equal(reply.ok, true); assert.equal(reply.result.status, 200);
  assert.equal(h.requests.at(-1).init.credentials, 'omit');
});
