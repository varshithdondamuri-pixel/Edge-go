const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Data fetchers
  getBattery: () => ipcRenderer.invoke('get-battery'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getMediaInfo: () => ipcRenderer.invoke('get-media-info'),

  // Window control
  expandWindow: (expanded) => ipcRenderer.send('expand-window', expanded),
  setWindowSize: (size) => ipcRenderer.send('set-window-size', size),
  setAlwaysOnTop: (value) => ipcRenderer.send('set-always-on-top', value),
  setLaunchAtStartup: (value) => ipcRenderer.send('set-launch-at-startup', value),
  quit: () => ipcRenderer.send('quit-app'),

  // Events from main → renderer
  onOpenSettings: (cb) => {
    const handler = (_event) => cb()
    ipcRenderer.on('open-settings', handler)
    return () => ipcRenderer.removeListener('open-settings', handler)
  },
  onMediaUpdate: (cb) => {
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('media-update', handler)
    return () => ipcRenderer.removeListener('media-update', handler)
  },
})
