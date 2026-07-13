const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kurogi", {
  platform: process.platform,
  exportVideo: (project, options) => ipcRenderer.invoke("export-video", project, options),
  saveKuroMotionFile: (envelope, defaultName) => ipcRenderer.invoke("save-kuromotion-file", envelope, defaultName),
  openKuroMotionFile: () => ipcRenderer.invoke("open-kuromotion-file"),
  showItemInFolder: (targetPath) => ipcRenderer.invoke("show-item-in-folder", targetPath),
  onExportProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on("export-progress", handler);
    return () => ipcRenderer.removeListener("export-progress", handler);
  },
});
