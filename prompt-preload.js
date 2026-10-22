'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('promptApi', {
  onInit: (cb) => ipcRenderer.on('aakar:prompt-init', (_e, data) => cb(data)),
  done: (value) => ipcRenderer.send('aakar:prompt-result', value)
});
