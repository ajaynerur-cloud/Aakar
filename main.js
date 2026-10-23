'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');

const APP_HTML = path.join(__dirname, 'app', 'index.html');
const BG = '#141922';
const WEB_PREFS = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false };

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 900, minHeight: 600,
    backgroundColor: BG, show: false, autoHideMenuBar: true, title: 'Aakar',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: WEB_PREFS
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(APP_HTML);
  return win;
}

// window.prompt() is not implemented in Electron: provide a synchronous replacement (the CAD code calls prompt() in many places)
ipcMain.on('aakar:prompt', (event, message, defaultValue) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  let answered = false;
  const finish = (value) => { if (answered) return; answered = true; event.returnValue = value; };
  const dlg = new BrowserWindow({
    width: 460, height: 210, parent: parent || undefined, modal: !!parent, resizable: false, minimizable: false, maximizable: false,
    show: false, autoHideMenuBar: true, backgroundColor: BG, title: 'Aakar',
    webPreferences: { preload: path.join(__dirname, 'prompt-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  dlg.setMenu(null);
  const onResult = (e, value) => { if (e.sender === dlg.webContents) { finish(value === undefined ? null : value); if (!dlg.isDestroyed()) dlg.close(); } };
  ipcMain.on('aakar:prompt-result', onResult);
  dlg.on('closed', () => { ipcMain.removeListener('aakar:prompt-result', onResult); finish(null); if (parent && !parent.isDestroyed()) parent.focus(); });
  dlg.webContents.once('did-finish-load', () => { dlg.webContents.send('aakar:prompt-init', { message: String(message == null ? '' : message), value: String(defaultValue == null ? '' : defaultValue) }); dlg.show(); });
  dlg.loadFile(path.join(__dirname, 'prompt.html'));
});

app.on('web-contents-created', (_e, contents) => {
  // pop-out projects use window.open(<same file>#x8open=...): allow those, send web links to the default browser
  contents.setWindowOpenHandler(({ url }) => {
    if (/^file:/i.test(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1500, height: 920, backgroundColor: BG, autoHideMenuBar: true, title: 'Aakar', icon: path.join(__dirname, 'build', 'icon.ico'), webPreferences: WEB_PREFS } };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => { if (!/^file:/i.test(url)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  // the app asks "unsaved changes?" with beforeunload; Electron needs an explicit dialog for that
  contents.on('will-prevent-unload', (e) => {
    const w = BrowserWindow.fromWebContents(contents);
    const choice = dialog.showMessageBoxSync(w, { type: 'question', buttons: ['Stay', 'Close without saving'], defaultId: 0, cancelId: 0, title: 'Aakar', message: 'You have unsaved changes.', detail: 'Close anyway and lose them?' });
    if (choice === 1) e.preventDefault();
  });
  // F12 = developer tools, F11 = full screen, Ctrl+Shift+R = reload (the menu bar is removed so the CAD shortcuts stay free)
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
  app.whenReady().then(() => { Menu.setApplicationMenu(null); createMainWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createMainWindow(); }); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
