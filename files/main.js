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
const unpacked = (d) => d.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const OCCT_DIR = unpacked(path.join(__dirname, 'app', 'occt'));
// Optional SMLib engine (commercial; you supply your licensed build): app/smlib/aakar-smlib.mjs (WebAssembly, served as aakar-asset://smlib/)
// and/or app/smlib/native/index.js (Node / N-API addon, runs here in the main process and is called over synchronous IPC).
const SMLIB_DIR = unpacked(path.join(__dirname, 'app', 'smlib'));
const ASSET_DIRS = { occt: OCCT_DIR, smlib: SMLIB_DIR };
const MIME = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };

/** request handler for aakar-asset:// (exported for the tests) */
async function serveAsset(request, dirOverride) {
  try {
    const u = new URL(request.url), rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (!Object.prototype.hasOwnProperty.call(ASSET_DIRS, u.hostname) || !rel || rel.split(/[\\/]/).includes('..')) return new Response('forbidden', { status: 403 });
    const dir = dirOverride || ASSET_DIRS[u.hostname];
    const file = path.join(dir, rel);
    if (!file.startsWith(path.resolve(dir) + path.sep)) return new Response('forbidden', { status: 403 });
    const data = await fs.promises.readFile(file);
    return new Response(data, { status: 200, headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' } });
  } catch (e) { return new Response('not found', { status: 404 }); }
}

// ---- SMLib native route: a kernel object living in this process; the page calls it through window.aakarDesktop.smlib (preload.js)
const smlib = { kernel: null, error: null, loaded: false, name: 'SMLib', version: '', handles: new Map(), next: 1 };
const SM_METHODS = ['box', 'cylinder', 'sphere', 'translate', 'fuse', 'cut', 'common', 'volume', 'area', 'mesh', 'stepExport', 'cone', 'torus', 'rotate', 'scale', 'bbox', 'massProps', 'info', 'validate', 'stepImport', 'release'];
/** loads app/smlib/native/index.js once (exported for the tests): it must export init(opts) -> kernel (or a Promise of one), or be the kernel */
async function loadSmlibNative(dir = path.join(SMLIB_DIR, 'native')) {
  if (smlib.loaded) return smlib; smlib.loaded = true;
  const file = path.join(dir, 'index.js');
  if (!fs.existsSync(file)) { smlib.error = 'no native SMLib module (' + path.relative(__dirname, file) + ')'; return smlib; }
  try {
    const m = require(file), k = typeof m.init === 'function' ? await m.init({ dir }) : m;
    const miss = SM_METHODS.slice(0, 11).filter((x) => typeof k[x] !== 'function');
    if (miss.length) throw new Error('the SMLib module lacks: ' + miss.join(', '));
    smlib.kernel = k; smlib.name = m.name || k.name || 'SMLib'; smlib.version = m.version || k.version || '';
  } catch (e) { smlib.error = (e && e.message) || String(e); }
  return smlib;
}
// shapes stay in this process; the page only ever sees handle objects { __sm: id }
const SHAPE_OUT = ['box', 'cylinder', 'sphere', 'translate', 'fuse', 'cut', 'common', 'cone', 'torus', 'rotate', 'scale', 'stepImport'];   // calls that return a shape
function smlibCall(method, args) {
  try {
    if (!smlib.kernel) return { ok: false, error: smlib.error || 'SMLib is not loaded' };
    if (!SM_METHODS.includes(method) || typeof smlib.kernel[method] !== 'function') return { ok: false, error: 'unknown method ' + method };
    const isH = (x) => x != null && typeof x === 'object' && typeof x.__sm === 'number';
    const a = (args || []).map((x) => { if (!isH(x)) return x; if (!smlib.handles.has(x.__sm)) throw new Error('stale SMLib handle ' + x.__sm); return smlib.handles.get(x.__sm); });
    if (method === 'release') { const h = args && args[0]; if (isH(h) && smlib.handles.has(h.__sm)) { const sh = smlib.handles.get(h.__sm); smlib.handles.delete(h.__sm); if (typeof smlib.kernel.release === 'function') try { smlib.kernel.release(sh); } catch (e) { /* ignore */ } } return { ok: true, value: null }; }
    let v = smlib.kernel[method](...a);
    if (SHAPE_OUT.includes(method)) {
      const id = smlib.next++; smlib.handles.set(id, v); v = { __sm: id };
      if (smlib.handles.size > 5000) [...smlib.handles.keys()].slice(0, 2000).forEach((k) => { const sh = smlib.handles.get(k); smlib.handles.delete(k); if (typeof smlib.kernel.release === 'function') try { smlib.kernel.release(sh); } catch (e) { /* ignore */ } });   // long replays: free the oldest intermediates
    }
    return { ok: true, value: v };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}
function smlibInfo() { return { available: !!smlib.kernel, name: smlib.name, version: smlib.version, error: smlib.error, methods: smlib.kernel ? SM_METHODS.filter((m) => typeof smlib.kernel[m] === 'function') : [] }; }
ipcMain.on('aakar:smlib-info', (event) => { loadSmlibNative().then(() => { event.returnValue = smlibInfo(); }, (e) => { event.returnValue = { available: false, error: String(e) }; }); });
ipcMain.on('aakar:smlib', (event, method, args) => { event.returnValue = smlibCall(method, args); });

function createMainWindow() {
  const win = new BrowserWindow({ width: 1600, height: 960, minWidth: 900, minHeight: 600, backgroundColor: BG, show: false, autoHideMenuBar: true, title: 'Aakar', icon: path.join(__dirname, 'build', 'icon.ico'), webPreferences: WEB_PREFS });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
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
module.exports = { serveAsset, loadSmlibNative, smlibCall, smlibInfo };
