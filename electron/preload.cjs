const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('kurogi', {
  platform: process.platform,
  exportVideo: (project) => ipcRenderer.invoke('export-video', project),
});
