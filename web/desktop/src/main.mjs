import { app, BrowserWindow, ipcMain, Menu, net, protocol, session, shell, dialog } from 'electron';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import background, { handle } from '../../extension/entrypoints/background.ts';
import { connectFromTab, allPagesClosed } from '../../extension/lib/discord.ts';
import { initServices, installPlayerRules, openAuth, setDesktopHooks } from './platform.mjs';
import { APP_ORIGIN, assetPath, isAppUrl, isAuthUrl, isHttps, validateRequest } from './policy.mjs';

protocol.registerSchemesAsPrivileged([{ scheme: 'bitchord', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
app.setName('BitChord Windows');
const profileArg = process.argv.find(arg => arg.startsWith('--bitchord-profile='));
const portableDir = path.join(path.dirname(process.execPath), 'data');
if (profileArg || existsSync(path.join(path.dirname(process.execPath), 'portable.txt'))) {
  const profile = profileArg ? path.resolve(profileArg.slice('--bitchord-profile='.length)) : portableDir;
  mkdirSync(profile, { recursive: true }); app.setPath('userData', profile);
}
if (!app.requestSingleInstanceLock()) app.quit();
let window;
app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => allPagesClosed());

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://*.youtube.com https://*.google.com https://*.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https: wss:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src https://www.youtube.com https://accounts.google.com; form-action 'none'";

function external(url) {
  if (isAuthUrl(url)) openAuth(url);
  else if (isHttps(url)) void shell.openExternal(url);
}

app.whenReady().then(async () => {
  const root = app.isPackaged ? path.join(process.resourcesPath, 'player') : path.resolve(__dirname, '../../app/dist');
  const playerSession = session.fromPartition('persist:bitchord-player');
  playerSession.setPermissionRequestHandler((_wc, permission, callback) => callback(['mediaKeySystem', 'clipboard-sanitized-write', 'speaker-selection'].includes(permission)));
  playerSession.setPermissionCheckHandler((_wc, permission, origin) => isAppUrl(origin) && ['clipboard-sanitized-write', 'speaker-selection'].includes(permission));
  playerSession.protocol.handle('bitchord', async (request) => {
    let file = assetPath(root, request.url, path);
    if (!file) return new Response('Not found', { status: 404 });
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (path.extname(file)) return new Response('Not found', { status: 404 });
      file = path.join(root, 'index.html');
    }
    const result = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(result.headers);
    headers.set('Content-Security-Policy', CSP);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(result.body, { status: result.status, headers });
  });
  background();
  window = new BrowserWindow({
    width: 1360, height: 900, minWidth: 900, minHeight: 640, show: false,
    title: 'BitChord Windows', backgroundColor: '#171717', autoHideMenuBar: true,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.resolve(__dirname, '../../../Logo.png'),
    webPreferences: { session: playerSession, preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  setDesktopHooks({ window, broadcast: event => !window.isDestroyed() && window.webContents.send('bitchord:event', event), connectDiscord: () => connectFromTab(() => {}) });
  initServices();
  installPlayerRules(playerSession);
  ipcMain.handle('bitchord:request', async (event, message) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isAppUrl(event.senderFrame.url) || !validateRequest(message)) {
      throw new Error('Invalid desktop request.');
    }
    return handle(message);
  });
  window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) { event.preventDefault(); external(url); } });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('page-title-updated', event => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'BitChord', submenu: [{ label: 'About BitChord Windows', click: () => dialog.showMessageBox(window, { title: 'BitChord Windows', message: 'BitChord 1.9.1 — Windows community port', detail: 'Based on the upstream v1.9.1 web player. GPLv3.\nDesktop build 1.9.1-desktop.1\n\nAccount sign-in and audio use this app’s own browser profile.' }) }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
  await window.loadURL(APP_ORIGIN + '/home');
}).catch(error => { console.error(error); dialog.showErrorBox('BitChord could not start', error.message); app.quit(); });
