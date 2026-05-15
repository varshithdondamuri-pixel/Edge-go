const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Data fetchers
  getBattery: () => ipcRenderer.invoke('get-battery'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getSystemState: () => ipcRenderer.invoke('get-system-state'),
  getMediaInfo: () => ipcRenderer.invoke('get-media-info'),
  mediaCommand: (cmd, value, source) => ipcRenderer.send('media-command', cmd, value, source),

  // Window control
  expandWindow: (expanded) => ipcRenderer.send('expand-window', expanded),
  setWindowSize: (size) => ipcRenderer.send('set-window-size', size),
  setAlwaysOnTop: (value) => ipcRenderer.send('set-always-on-top', value),
  setLaunchAtStartup: (value) => ipcRenderer.send('set-launch-at-startup', value),
  setNotchPosition: (position, width) => ipcRenderer.send('set-notch-position', position, width),
  openSettings: (tab) => ipcRenderer.send('open-settings', tab),
  closeSettings: () => ipcRenderer.send('close-settings'),
  setControlCenter: (isOpen) => ipcRenderer.send('set-control-center', isOpen),
  setBrightness: (level) => ipcRenderer.send('set-brightness', level),
  setDND: (enabled) => ipcRenderer.send('set-dnd', enabled),
  setNightLight: (enabled) => ipcRenderer.send('set-nightlight', enabled),
  takeScreenshot: () => ipcRenderer.send('take-screenshot'),
  quit: () => ipcRenderer.send('quit-app'),

  // Settings sync
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),

  // Events from main → renderer
  onSettingsUpdated: (cb) => {
    const handler = (_event, settings) => cb(settings)
    ipcRenderer.on('settings-updated', handler)
    return () => ipcRenderer.removeListener('settings-updated', handler)
  },
  onOpenSettingsTab: (cb) => {
    const handler = (_event, tab) => cb(tab)
    ipcRenderer.on('open-settings-tab', handler)
    return () => ipcRenderer.removeListener('open-settings-tab', handler)
  },
  onMediaUpdate: (cb) => {
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('media-update', handler)
    return () => ipcRenderer.removeListener('media-update', handler)
  },
})
