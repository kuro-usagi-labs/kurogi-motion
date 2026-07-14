const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kurogi", {
  platform: process.platform,
  exportVideo: (project, options) => ipcRenderer.invoke("export-video", project, options),
  renderPreviewFrame: (project, options) => ipcRenderer.invoke("render-preview-frame", project, options),
  startRenderJob: (project, options) => ipcRenderer.invoke("start-render-job", project, options),
  getRenderJob: (jobId) => ipcRenderer.invoke("get-render-job", jobId),
  cancelRenderJob: (jobId) => ipcRenderer.invoke("cancel-render-job", jobId),
  saveKuroMotionFile: (envelope, defaultName) => ipcRenderer.invoke("save-kuromotion-file", envelope, defaultName),
  openKuroMotionFile: () => ipcRenderer.invoke("open-kuromotion-file"),
  showItemInFolder: (targetPath) => ipcRenderer.invoke("show-item-in-folder", targetPath),
  getMcpInfo: () => ipcRenderer.invoke("mcp-info"),
  readMcpMediaFile: (filePath) => ipcRenderer.invoke("read-mcp-media-file", filePath),
  onMcpRequest: (listener) => {
    const handler = (_event, request) => listener(request);
    ipcRenderer.on("mcp-request", handler);
    return () => ipcRenderer.removeListener("mcp-request", handler);
  },
  respondMcpRequest: (response) => ipcRenderer.send("mcp-response", response),
  onExportProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on("export-progress", handler);
    return () => ipcRenderer.removeListener("export-progress", handler);
  },
});
