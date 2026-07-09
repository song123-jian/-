const { contextBridge, ipcRenderer } = require('electron')

const WINDOW_MANAGER_CHANGED_CHANNEL = 'desktop:window-manager:state-changed'

contextBridge.exposeInMainWorld('desktopUpdater', {
  getVersionInfo: () => ipcRenderer.invoke('desktop:get-version-info'),
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),
  openDownload: (downloadUrl) => ipcRenderer.invoke('desktop:open-update-download', downloadUrl),
})

contextBridge.exposeInMainWorld('desktopWindowManager', {
  getState: () => ipcRenderer.invoke('desktop:window-manager:get-state'),
  createWindow: () => ipcRenderer.invoke('desktop:window-manager:create'),
  focusWindow: (windowId) => ipcRenderer.invoke('desktop:window-manager:focus', windowId),
  hideCurrentWindow: () => ipcRenderer.invoke('desktop:window-manager:hide-current'),
  showAllWindows: () => ipcRenderer.invoke('desktop:window-manager:show-all'),
  resetLayout: () => ipcRenderer.invoke('desktop:window-manager:reset-layout'),
  setCloseBehavior: (behavior) => ipcRenderer.invoke('desktop:window-manager:set-close-behavior', behavior),
  quitApp: () => ipcRenderer.invoke('desktop:window-manager:quit'),
  onStateChanged: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, state) => callback(state)
    ipcRenderer.on(WINDOW_MANAGER_CHANGED_CHANNEL, handler)
    return () => ipcRenderer.removeListener(WINDOW_MANAGER_CHANGED_CHANNEL, handler)
  },
})
