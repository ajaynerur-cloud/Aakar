'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
contextBridge.exposeInMainWorld('aakarDesktop', {
  isDesktop: true,
  prompt: (message, value) => ipcRenderer.sendSync('aakar:prompt', message, value),
  // workspace folder for the start page (main.js restricts every call to the chosen folder)
  ws: {
    pick: () => ipcRenderer.invoke('aakar:ws-pick'),
    set: (dir, opt) => ipcRenderer.invoke('aakar:ws-set', dir, opt),
    list: (opt) => ipcRenderer.invoke('aakar:ws-list', opt),
    read: (rel) => ipcRenderer.invoke('aakar:ws-read', rel),
    write: (rel, data, overwrite) => ipcRenderer.invoke('aakar:ws-write', rel, data, !!overwrite),
    reveal: () => ipcRenderer.invoke('aakar:ws-reveal'),
    onChange: (cb) => { ipcRenderer.on('aakar:ws-changed', () => { try { cb(); } catch (e) { /* ignore */ } }); }
  }
});
webFrame.executeJavaScript('window.prompt = function (m, d) { return window.aakarDesktop.prompt(m, d); };').catch(() => {});
