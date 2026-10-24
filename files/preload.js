'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
contextBridge.exposeInMainWorld('aakarDesktop', {
  isDesktop: true,
  prompt: (message, value) => ipcRenderer.sendSync('aakar:prompt', message, value),
  // optional SMLib engine (native route, see app/smlib/README.md): synchronous calls into the main process
  smlib: { info: () => ipcRenderer.sendSync('aakar:smlib-info'), call: (method, args) => ipcRenderer.sendSync('aakar:smlib', method, args) }
});
webFrame.executeJavaScript('window.prompt = function (m, d) { return window.aakarDesktop.prompt(m, d); };').catch(() => {});
