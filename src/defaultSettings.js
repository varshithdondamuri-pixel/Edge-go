export const DEFAULT_SETTINGS = Object.freeze({
  launchAtStartup: false,
  alwaysOnTop: true,
  showInTaskbar: true,
  notchPosition: 'center',
  use24h: true,
  language: 'en',

  accentColor: '#7c6af7',
  glowEffect: true,
  blurIntensity: 'medium',
  cornerRadius: 20,
  collapsedWidth: 300,
  expandedWidth: 620,
  animationSpeed: 'normal',
  darkMode: true,
  enableWindowShadow: true,

  showAlbumArt: true,
  showVisualizer: true,
  showSource: true,
  showProgressBar: true,
  sneakPeek: true,
  mediaPollingInterval: 2,

  showCalendar: true,
  showDayNames: true,
  weekStartsMonday: false,
  showWeekNumbers: false,

  volumeHUD: true,
  brightnessHUD: true,
  batteryHUD: true,
  hudPosition: 'bottom-center',

  showBattery: true,
  showBatteryPct: true,
  showPowerIcons: true,
  batteryNotifications: true,

  showSystemMonitor: true,

  spotifyEnabled: true,
  browserEnabled: true,
  youtubeEnabled: true,
  windowsMediaEnabled: true,
  calendarConnector: true,
  clipboardEnabled: true,
  controlCenterEnabled: true,
  syncBridgeEnabled: true,
  betaModeEnabled: false,
  soundEnabled: false,
  docked: false,

  // ── Beta / Agent settings ──────────────────────────────────────────────────
  showInDock: false,
  showInScreenRecordings: true,
  agentFolder: 'Default',
  agentPermissionsEnabled: true,
  agentIntegrationsEnabled: true,
  bingApiKey: '',
  bingMaxResults: 10,
  voiceProfile: 'Default',
  microphoneSource: 'System Default',

  gpuAcceleration: true,
  transparencyEffects: true,
  developerMode: false,
  autoCheckUpdates: true,
  autoDownloadUpdates: true,
})

export function normalizeSettings(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) }
}

export function settingsEqual(a, b) {
  const left = normalizeSettings(a)
  const right = normalizeSettings(b)
  const keys = Object.keys(DEFAULT_SETTINGS)
  return keys.every(key => left[key] === right[key])
}

export function loadStoredSettings() {
  try {
    const saved = localStorage.getItem('edge-go-settings')
    return saved ? normalizeSettings(JSON.parse(saved)) : normalizeSettings()
  } catch {
    return normalizeSettings()
  }
}

export function saveStoredSettings(settings) {
  try {
    localStorage.setItem('edge-go-settings', JSON.stringify(normalizeSettings(settings)))
  } catch {}
}

export function applySettingsToDocument(settings) {
  const s = normalizeSettings(settings)
  const root = document.documentElement
  const blurMap = { low: '12px', medium: '20px', high: '32px' }
  const speedMap = { slow: '620ms', normal: '340ms', fast: '180ms', off: '0ms' }
  const blur = s.transparencyEffects ? (blurMap[s.blurIntensity] || blurMap.medium) : '0px'
  const darkSurface = s.transparencyEffects ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.96)'
  const lightSurface = s.transparencyEffects ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.97)'

  root.style.setProperty('--color-accent', s.accentColor)
  root.style.setProperty('--color-accent-glow', s.glowEffect ? `${s.accentColor}59` : 'rgba(0,0,0,0)')
  root.style.setProperty('--notch-radius', `${s.cornerRadius}px`)
  root.style.setProperty('--notch-collapsed-width', `${s.collapsedWidth}px`)
  root.style.setProperty('--notch-expanded-width', `${s.expandedWidth}px`)
  root.style.setProperty('--notch-blur', blur)
  root.style.setProperty('--notch-glass-blur', blur)
  root.style.setProperty('--notch-anim-speed', speedMap[s.animationSpeed] || speedMap.normal)
  root.style.setProperty('--notch-glass-bg', s.darkMode ? darkSurface : lightSurface)
  root.style.setProperty('--is-dark', s.darkMode ? '1' : '0')

  root.classList.toggle('dark', !!s.darkMode)
  root.classList.toggle('reduce-motion', s.animationSpeed === 'off')
  root.classList.toggle('no-transparency', !s.transparencyEffects)
}
