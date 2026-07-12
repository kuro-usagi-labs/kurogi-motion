const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kurogi", {
  platform: process.platform,
  exportVideo: (project, options) => ipcRenderer.invoke("export-video", project, options),
  onExportProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on("export-progress", handler);
    return () => ipcRenderer.removeListener("export-progress", handler);
  },
});
