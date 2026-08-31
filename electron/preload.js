'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('lotteryAPI', {
  get: (game) => ipcRenderer.invoke('data:get', game),
  refresh: (game) => ipcRenderer.invoke('data:refresh', game),
  status: (game) => ipcRenderer.invoke('data:status', game),
  gpuInfo: () => ipcRenderer.invoke('gpu:info')
})
