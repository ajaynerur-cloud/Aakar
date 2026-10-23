'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');
contextBridge.exposeInMainWorld('aakarDesktop', { isDesktop: true, prompt: (message, value) => ipcRenderer.sendSync('aakar:prompt', message, value) });
webFrame.executeJavaScript('window.prompt = function (m, d) { return window.aakarDesktop.prompt(m, d); };').catch(() => {});
