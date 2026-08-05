const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Data fetchers
  getBattery: () => ipcRenderer.invoke('get-battery'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getSystemState: () => ipcRenderer.invoke('get-system-state'),
  getMediaInfo: () => ipcRenderer.invoke('get-media-info'),
  getSystemUsage: () => ipcRenderer.invoke('get-system-usage'),
  getSystemVolume: () => ipcRenderer.invoke('get-system-volume'),
  getWifiNetworks: () => ipcRenderer.invoke('get-wifi-networks'),
  connectWifiNetwork: (ssid) => ipcRenderer.invoke('connect-wifi-network', ssid),
  mediaCommand: (cmd, value, source) => ipcRenderer.send('media-command', cmd, value, source),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  checkInternet: () => ipcRenderer.invoke('check-internet'),
  checkGitUpdate: () => ipcRenderer.invoke('check-git-update'),
  performGitUpdate: () => ipcRenderer.invoke('perform-git-update'),

  // Window control
  expandWindow: (expanded, opts) => ipcRenderer.send('expand-window', expanded, opts),
  setWindowSize: (size) => ipcRenderer.send('set-window-size', size),
  setAlwaysOnTop: (value) => ipcRenderer.send('set-always-on-top', value),
  setShowInTaskbar: (value) => ipcRenderer.send('set-show-in-taskbar', value),
  setWindowEffects: (effects) => ipcRenderer.send('set-window-effects', effects),
  setLaunchAtStartup: (value) => ipcRenderer.send('set-launch-at-startup', value),
  setNotchPosition: (position, width) => ipcRenderer.send('set-notch-position', position, width),
  openSettings: (tab) => ipcRenderer.send('open-settings', tab),
  closeSettings: () => ipcRenderer.send('close-settings'),
  setControlCenter: (isOpen) => ipcRenderer.send('set-control-center', isOpen),
  setControlCenterDocked: (docked) => ipcRenderer.send('set-control-center-docked', docked),
  setPanelLocked: (locked) => ipcRenderer.send('set-panel-locked', locked),
  setSystemControl: (control, value) => ipcRenderer.invoke('set-system-control', control, value),
  setBrightness: (level) => ipcRenderer.invoke('set-system-control', 'brightness', level),
  setDND: (enabled) => ipcRenderer.invoke('set-system-control', 'dnd', enabled),
  setNightLight: (enabled) => ipcRenderer.invoke('set-system-control', 'nightLight', enabled),
  takeScreenshot: () => ipcRenderer.send('take-screenshot'),
  openDevTools: () => ipcRenderer.send('open-devtools'),
  quit: () => ipcRenderer.send('quit-app'),

  // Settings sync
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings) => ipcRenderer.send('update-settings', settings),
  exportProfile: (profileData) => ipcRenderer.invoke('export-profile', profileData),
  importProfile: () => ipcRenderer.invoke('import-profile'),
  browseAndLaunchExe: () => ipcRenderer.invoke('browse-and-launch-exe'),
  launchExeFile: (exePath) => ipcRenderer.invoke('launch-exe-file', exePath),

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
  onVolumeUpdated: (cb) => {
    const handler = (_event, vol) => cb(vol)
    ipcRenderer.on('volume-updated', handler)
    return () => ipcRenderer.removeListener('volume-updated', handler)
  },
  onOpenControlCenter: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('open-control-center', handler)
    return () => ipcRenderer.removeListener('open-control-center', handler)
  },
  onOpenClipboard: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('open-clipboard', handler)
    return () => ipcRenderer.removeListener('open-clipboard', handler)
  },

  // Agent Communication
  sendAgentPrompt: (text) => ipcRenderer.send('send-agent-prompt', text),
  restartAgentDaemon: () => ipcRenderer.send('restart-agent-daemon'),
  setWakeWord: (enabled) => ipcRenderer.send('set-wake-word', enabled),
  setVoiceListenerSuspended: (suspended) => ipcRenderer.send('set-voice-listener-suspended', suspended),
  checkMicPermission: () => ipcRenderer.invoke('check-mic-permission'),
  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),
  sendAgentPermissionResponse: (requestId, granted) => ipcRenderer.send('send-agent-permission-response', requestId, granted),
  onAgentMsg: (cb) => {
    const handler = (_event, data) => cb(data)
    ipcRenderer.on('agent-msg', handler)
    return () => ipcRenderer.removeListener('agent-msg', handler)
  },
})
