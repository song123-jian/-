const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopUpdater', {
  getVersionInfo: () => ipcRenderer.invoke('desktop:get-version-info'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  openDownload: (downloadUrl) => ipcRenderer.invoke('desktop:open-update-download', downloadUrl),
})
