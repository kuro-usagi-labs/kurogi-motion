const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("kurogi", {
  platform: process.platform,
  exportVideo: (project, format) =>
    ipcRenderer.invoke("export-video", project, format),
});
