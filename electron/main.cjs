const {app, BrowserWindow, dialog, ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1560, height: 980, minWidth: 1120, minHeight: 720,
    backgroundColor: '#11121a',
    titleBarStyle: 'hidden', titleBarOverlay: {color: '#11121a', symbolColor: '#d9d9e4'},
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true}
  });
  const url = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
  window.loadURL(url);
};
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('export-video', async (_event, project) => {
  const target = await dialog.showSaveDialog({title: 'Export Kurogi Motion', defaultPath: `${project.name || 'kurogi-motion'}.webm`, filters: [{name: 'WebM video', extensions: ['webm']}]});
  if (target.canceled || !target.filePath) return {canceled: true};
  const {bundle} = await import('@remotion/bundler');
  const {selectComposition, renderMedia} = await import('@remotion/renderer');
  const serveUrl = await bundle({entryPoint: path.join(__dirname, '..', 'src', 'remotion-entry.tsx'), webpackOverride: (config) => config});
  const composition = await selectComposition({serveUrl, id: 'KurogiMotion', inputProps: {project}});
  await renderMedia({composition, serveUrl, codec: 'vp8', outputLocation: target.filePath, inputProps: {project}});
  return {path: target.filePath};
});
