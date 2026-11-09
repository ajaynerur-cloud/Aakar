'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_HTML = path.join(__dirname, 'app', 'index.html');
const BG = '#141922';
const WEB_PREFS = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false };

// Optional exact kernel (OpenCascade WebAssembly). Its files live in app/occt and are served as aakar-asset://occt/<file>:
// a file:// page cannot fetch WebAssembly or import ES modules from disk, a privileged custom scheme can.
protocol.registerSchemesAsPrivileged([{ scheme: 'aakar-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const OCCT_DIR = path.join(__dirname, 'app', 'occt').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const MIME = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };

/** request handler for aakar-asset:// (exported for the tests) */
async function serveAsset(request, dir = OCCT_DIR) {
  try {
    const u = new URL(request.url), rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (u.hostname !== 'occt' || !rel || rel.split(/[\\/]/).includes('..')) return new Response('forbidden', { status: 403 });
    const file = path.join(dir, rel);
    if (!file.startsWith(path.resolve(dir) + path.sep)) return new Response('forbidden', { status: 403 });
    const data = await fs.promises.readFile(file);
    return new Response(data, { status: 200, headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' } });
  } catch (e) { return new Response('not found', { status: 404 }); }
}


// ---------------------------------------------------------------- workspace folder (start page): list / read / write .aakar files under one chosen folder
let WS_ROOT = '', WS_WATCHER = null;
const WS_EXT = /\.(aakar|aakar\.json|prism\.json|prism)$/i;
function wsInside(rel) { if (!WS_ROOT || typeof rel !== 'string') return null; const f = path.resolve(WS_ROOT, rel); return (f === WS_ROOT || f.startsWith(WS_ROOT + path.sep)) ? f : null; }
function wsWalk(dir, base, sub, out, depth) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const d of ents) {
    if (out.length >= 5000) return;
    if (d.name.startsWith('.') || d.name === 'node_modules') continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) { if (sub && depth < 6) wsWalk(full, base, sub, out, depth + 1); }
    else if (d.isFile() && WS_EXT.test(d.name)) { try { const st = fs.statSync(full); out.push({ rel: path.relative(base, full).split(path.sep).join('/'), name: d.name, mtime: st.mtimeMs, size: st.size }); } catch (e) { /* skip */ } }
  }
}
function wsWatch(on, sender) {
  if (WS_WATCHER) { try { WS_WATCHER.close(); } catch (e) { /* ignore */ } WS_WATCHER = null; }
  if (!on || !WS_ROOT) return;
  let timer = null;
  try { WS_WATCHER = fs.watch(WS_ROOT, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => { try { if (!sender.isDestroyed()) sender.send('aakar:ws-changed'); } catch (e) { /* ignore */ } }, 300); }); WS_WATCHER.on('error', () => {}); } catch (e) { WS_WATCHER = null; }
}
ipcMain.handle('aakar:ws-pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(win, { title: 'Choose your Aakar workspace folder', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});
ipcMain.handle('aakar:ws-set', (event, dir, opt) => {
  try { const p = path.resolve(String(dir || '')); if (!fs.statSync(p).isDirectory()) return { ok: false, error: 'Not a folder' }; WS_ROOT = p; wsWatch(!!(opt && opt.watch), event.sender); return { ok: true }; }
  catch (e) { return { ok: false, error: 'Folder not found' }; }
});
ipcMain.handle('aakar:ws-list', (event, opt) => { const out = []; if (WS_ROOT) wsWalk(WS_ROOT, WS_ROOT, !(opt && opt.sub === false), out, 0); return out; });
ipcMain.handle('aakar:ws-read', (event, rel) => { const f = wsInside(rel); if (!f || !WS_EXT.test(f)) throw new Error('not allowed'); return fs.readFileSync(f); });
ipcMain.handle('aakar:ws-write', (event, rel, data, overwrite) => {
  try {
    let f = wsInside(rel); if (!f || !WS_EXT.test(f)) return { ok: false, error: 'not allowed' };
    if (!overwrite) { const ext = path.extname(f), stem = f.slice(0, f.length - ext.length); let n = 2; while (fs.existsSync(f)) f = stem + ' (' + (n++) + ')' + ext; }
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(data));
    return { ok: true, rel: path.relative(WS_ROOT, f).split(path.sep).join('/') };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('aakar:ws-reveal', () => { if (WS_ROOT) shell.openPath(WS_ROOT); });

// window buttons for the page (full-screen strip): leave full screen, minimise, maximise / restore, close
ipcMain.handle('aakar:win', (event, act) => {
  const w = BrowserWindow.fromWebContents(event.sender); if (!w) return false;
  if (act === 'fs-off') { try { if (w.isFullScreen()) w.setFullScreen(false); event.sender.executeJavaScript('document.fullscreenElement && document.exitFullscreen && document.exitFullscreen()').catch(() => {}); } catch (e) { /* ignore */ } }
  else if (act === 'fs-on') w.setFullScreen(true);
  else if (act === 'min') w.minimize();
  else if (act === 'max') { if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
  else if (act === 'close') w.close();
  return true;
});

function createMainWindow() {
  const win = new BrowserWindow({ width: 1600, height: 960, minWidth: 900, minHeight: 600, backgroundColor: BG, show: false, frame: true, fullscreen: false, fullscreenable: true, autoHideMenuBar: true, title: 'Aakar', icon: path.join(__dirname, 'build', 'icon.ico'), webPreferences: WEB_PREFS });
  win.once('ready-to-show', () => { try { win.setFullScreen(false); } catch (e) { /* ignore */ } win.maximize(); win.show(); });
  // tell the page when full screen starts / ends, so it can show an always-reachable Exit / Minimise / Close strip
  const fsTell = (v) => { try { win.webContents.send('aakar:fs', v); } catch (e) { /* ignore */ } };
  win.on('enter-full-screen', () => fsTell(true)); win.on('leave-full-screen', () => fsTell(false));
  win.webContents.on('enter-html-full-screen', () => fsTell(true)); win.webContents.on('leave-html-full-screen', () => fsTell(false));
  win.loadFile(APP_HTML);
  return win;
}

// window.prompt() does not exist in Electron: a synchronous replacement (the CAD code calls prompt() in places)
ipcMain.on('aakar:prompt', (event, message, defaultValue) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  let answered = false; const finish = (value) => { if (answered) return; answered = true; event.returnValue = value; };
  const dlg = new BrowserWindow({ width: 460, height: 210, parent: parent || undefined, modal: !!parent, resizable: false, minimizable: false, maximizable: false, show: false, autoHideMenuBar: true, backgroundColor: BG, title: 'Aakar',
    webPreferences: { preload: path.join(__dirname, 'prompt-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  dlg.setMenu(null);
  const onResult = (e, value) => { if (e.sender === dlg.webContents) { finish(value === undefined ? null : value); if (!dlg.isDestroyed()) dlg.close(); } };
  ipcMain.on('aakar:prompt-result', onResult);
  dlg.on('closed', () => { ipcMain.removeListener('aakar:prompt-result', onResult); finish(null); if (parent && !parent.isDestroyed()) parent.focus(); });
  dlg.webContents.once('did-finish-load', () => { dlg.webContents.send('aakar:prompt-init', { message: String(message == null ? '' : message), value: String(defaultValue == null ? '' : defaultValue) }); dlg.show(); });
  dlg.loadFile(path.join(__dirname, 'prompt.html'));
});

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^file:/i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1500, height: 920, backgroundColor: BG, autoHideMenuBar: true, title: 'Aakar', icon: path.join(__dirname, 'build', 'icon.ico'), webPreferences: WEB_PREFS } };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => { if (!/^file:/i.test(url)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  contents.on('will-prevent-unload', (e) => {
    const w = BrowserWindow.fromWebContents(contents);
    const choice = dialog.showMessageBoxSync(w, { type: 'question', buttons: ['Stay', 'Close without saving'], defaultId: 0, cancelId: 0, title: 'Aakar', message: 'You have unsaved changes.', detail: 'Close anyway and lose them?' });
    if (choice === 1) e.preventDefault();
  });
  contents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') { contents.toggleDevTools(); e.preventDefault(); }
    else if (input.key === 'Escape' && (() => { const w = BrowserWindow.fromWebContents(contents); return w && w.isFullScreen(); })()) { const w = BrowserWindow.fromWebContents(contents); w.setFullScreen(false); }
    else if (input.key === 'F11') { const w = BrowserWindow.fromWebContents(contents); if (w) w.setFullScreen(!w.isFullScreen()); e.preventDefault(); }
    else if (input.control && input.shift && (input.key === 'R' || input.key === 'r')) { contents.reloadIgnoringCache(); e.preventDefault(); }
  });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('aakar-asset', (request) => serveAsset(request));
    Menu.setApplicationMenu(null); createMainWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMainWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
module.exports = { serveAsset };
