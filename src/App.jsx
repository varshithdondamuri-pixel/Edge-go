import { useState, useEffect, useCallback, useRef } from 'react'
import NotchBar from './components/NotchBar.jsx'
import VolumeHUD from './components/VolumeHUD.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import ClipboardDock from './components/ClipboardDock.jsx'
import ControlCenter from './components/ControlCenter.jsx'

// ─── Default media state ──────────────

const INITIAL_MEDIA = {
  title: '',
  artist: '',
  album: '',
  albumArt: null,
  source: null,
  duration: 0,
  isPlaying: false,
  volume: 50,
  position: 0,
}

const isElectron = !!window.electronAPI

// ─── Load + merge settings ────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  launchAtStartup: false,
  alwaysOnTop: true,
  showInTaskbar: false,
  notchPosition: 'center',
  use24h: true,
  language: 'en',
  accentColor: '#7c6af7',
  glowEffect: true,
  blurIntensity: 'medium',
  cornerRadius: 20,
  collapsedWidth: 320,
  expandedWidth: 680,
  animationSpeed: 'normal',
  darkMode: true,
  enableWindowShadow: true,
  showAlbumArt: true,
  showVisualizer: true,
  showSource: true,
  showProgressBar: true,
  volumeHUDEnabled: true,
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
  spotifyEnabled: true,
  browserEnabled: true,
  calendarConnector: true,
  clipboardEnabled: true,
  controlCenterEnabled: true,
  gpuAcceleration: true,
  transparencyEffects: true,
  developerMode: false,
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('edge-go-settings')
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem('edge-go-settings', JSON.stringify(s))
  } catch {}
}

export default function App() {
  const [media, setMedia] = useState(INITIAL_MEDIA)
  const [allSessions, setAllSessions] = useState([])
  const [battery, setBattery] = useState({ level: 100, charging: false, available: false })
  const [settings, setSettings] = useState(loadSettings)

  // ── Routing ───────────────────────────────────────────────────────────────
  const [route, setRoute] = useState(window.location.hash)
  const [controlCenterOpen, setControlCenterOpen] = useState(false)
  const [clipboardOpen, setClipboardOpen] = useState(false)
  const [volumeHUD, setVolumeHUD] = useState({ visible: false, level: 50 })

  const positionTimerRef = useRef(null)
  const volumeTimerRef = useRef(null)

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const isSettingsRoute = route.startsWith('#settings')
  const settingsTab = new URLSearchParams(route.split('?')[1]).get('tab') || 'general'

  // ── Settings Sync (from main window → settings window via IPC) ──────────
  useEffect(() => {
    if (!isElectron || !window.electronAPI.onSettingsUpdated) return
    return window.electronAPI.onSettingsUpdated((newSettings) => {
      const merged = { ...DEFAULT_SETTINGS, ...newSettings }
      setSettings(merged)
      saveSettings(merged)
    })
  }, [])

  // ── Persist + broadcast whenever settings change ─────────────────────────
  const prevSettingsRef = useRef(null)
  useEffect(() => {
    // Avoid broadcasting on initial mount (which would overwrite settings window's state)
    if (prevSettingsRef.current === null) {
      prevSettingsRef.current = settings
      return
    }
    saveSettings(settings)
    if (isElectron && window.electronAPI?.updateSettings) {
      window.electronAPI.updateSettings(settings)
    }
    prevSettingsRef.current = settings
  }, [settings])

  // ── Apply Settings to Root DOM ───────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement
    if (settings.accentColor) {
      root.style.setProperty('--color-accent', settings.accentColor)
      root.style.setProperty('--color-accent-glow', settings.accentColor + '59')
    }
    if (settings.cornerRadius !== undefined) {
      root.style.setProperty('--notch-radius', `${settings.cornerRadius}px`)
    }
    if (settings.collapsedWidth !== undefined) {
      root.style.setProperty('--notch-collapsed-width', `${settings.collapsedWidth}px`)
    }
    if (settings.expandedWidth !== undefined) {
      root.style.setProperty('--notch-expanded-width', `${settings.expandedWidth}px`)
    }
    if (settings.blurIntensity) {
      const blurMap = { low: '12px', medium: '24px', high: '40px' }
      root.style.setProperty('--notch-blur', blurMap[settings.blurIntensity] || '24px')
    }
    if (settings.animationSpeed) {
      const speedMap = { slow: '800ms', normal: '500ms', fast: '250ms', off: '0ms' }
      root.style.setProperty('--notch-anim-speed', speedMap[settings.animationSpeed] || '500ms')
    }
    if (settings.darkMode !== undefined) {
      if (settings.darkMode) root.classList.add('dark')
      else root.classList.remove('dark')
    }
    // Notch position — send to main process to reposition window
    if (isElectron && window.electronAPI?.setNotchPosition) {
      window.electronAPI.setNotchPosition(settings.notchPosition || 'center', settings.collapsedWidth || 320)
    }
  }, [settings])

  // ── Battery polling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron || !window.electronAPI.getBattery) return
    const fetchBattery = async () => {
      try {
        const b = await window.electronAPI.getBattery()
        if (b) setBattery(b)
      } catch {}
    }
    fetchBattery()
    const id = setInterval(fetchBattery, 30000)
    return () => clearInterval(id)
  }, [])

  // ── Real Media polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron || !window.electronAPI.getMediaInfo) return
    let isMounted = true
    const fetchMedia = async () => {
      try {
        const info = await window.electronAPI.getMediaInfo()
        if (!isMounted) return
        if (Array.isArray(info) && info.length > 0) {
          setAllSessions(info)
          // Priority: playing Spotify > any playing > first session
          const spotify = info.find(s => s.source?.toLowerCase().includes('spotify') && s.isPlaying)
          const active = info.find(s => s.isPlaying)
          setMedia(spotify || active || info[0] || INITIAL_MEDIA)
        } else {
          setAllSessions([])
          setMedia(INITIAL_MEDIA)
        }
      } catch {}
    }
    fetchMedia()
    const pollMs = (settings.mediaPollingInterval || 2) * 1000
    const id = setInterval(fetchMedia, pollMs)
    return () => {
      isMounted = false
      clearInterval(id)
    }
  }, [settings.mediaPollingInterval])

  // ── Media position smooth ticker ──────────────────────────────────────────
  useEffect(() => {
    if (!media.isPlaying || !media.duration) {
      clearInterval(positionTimerRef.current)
      return
    }
    positionTimerRef.current = setInterval(() => {
      setMedia(m => {
        const next = m.position + 1
        return next >= m.duration ? m : { ...m, position: next }
      })
    }, 1000)
    return () => clearInterval(positionTimerRef.current)
  }, [media.isPlaying, media.duration])

  // ── Volume HUD helper ─────────────────────────────────────────────────────
  const showVolumeHUD = useCallback((level) => {
    setVolumeHUD({ visible: true, level })
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current)
    volumeTimerRef.current = setTimeout(
      () => setVolumeHUD(v => ({ ...v, visible: false })),
      2500
    )
  }, [])

  // ── Media controls ────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (isElectron && window.electronAPI.mediaCommand) {
      window.electronAPI.mediaCommand('playpause', null, media.source)
      setMedia(m => ({ ...m, isPlaying: !m.isPlaying }))
    }
  }, [media.source])

  const handleNext = useCallback(() => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('next', null, media.source)
  }, [media.source])

  const handlePrev = useCallback(() => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('prev', null, media.source)
  }, [media.source])

  const handleVolumeChange = useCallback((level) => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('volume', level, media.source)
    setMedia(m => ({ ...m, volume: level }))
    showVolumeHUD(level)
  }, [showVolumeHUD, media.source])

  const handleSeek = useCallback((position) => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('seek', position, media.source)
    setMedia(m => ({ ...m, position }))
  }, [media.source])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'AudioVolumeUp') {
        setMedia(m => { const v = Math.min(100, m.volume + 5); showVolumeHUD(v); return { ...m, volume: v } })
      } else if (e.key === 'AudioVolumeDown') {
        setMedia(m => { const v = Math.max(0, m.volume - 5); showVolumeHUD(v); return { ...m, volume: v } })
      } else if (e.key === 'AudioVolumeMute') {
        setMedia(m => { const v = m.volume > 0 ? 0 : 50; showVolumeHUD(v); return { ...m, volume: v } })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showVolumeHUD])

  // ── Control Center window resize ──────────────────────────────────────────
  useEffect(() => {
    if (isElectron && window.electronAPI.setControlCenter) {
      window.electronAPI.setControlCenter(controlCenterOpen)
    }
  }, [controlCenterOpen])

  // ── Settings route (standalone settings window) ──────────────────────────
  if (isSettingsRoute) {
    return (
      <SettingsPanel
        open={true}
        onClose={() => window.electronAPI?.closeSettings()}
        initialTab={settingsTab}
        isStandalone={true}
        settings={settings}
        onSettingsChange={(updater) => {
          setSettings(prev => {
            const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
            saveSettings(next)
            if (isElectron && window.electronAPI?.updateSettings) {
              window.electronAPI.updateSettings(next)
            }
            return next
          })
        }}
      />
    )
  }

  return (
    <>
      <NotchBar
        media={media}
        battery={battery}
        settings={settings}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        onVolumeChange={handleVolumeChange}
        onSeek={handleSeek}
        onSettingsOpen={() => window.electronAPI?.openSettings('general')}
        onClipboardOpen={() => setClipboardOpen(true)}
        onControlCenterOpen={() => setControlCenterOpen(true)}
      />
      <VolumeHUD visible={volumeHUD.visible} level={volumeHUD.level} />
      <ClipboardDock open={clipboardOpen} onClose={() => setClipboardOpen(false)} />
      <ControlCenter
        open={controlCenterOpen}
        onClose={() => setControlCenterOpen(false)}
        onOpenSettings={(tab) => {
          window.electronAPI?.openSettings(tab || 'general')
          setControlCenterOpen(false)
        }}
        battery={battery}
        mediaVolume={media.volume}
        onVolumeChange={handleVolumeChange}
        allSessions={allSessions}
        onMediaCommand={(command, value, source) => {
          if (isElectron && window.electronAPI.mediaCommand)
            window.electronAPI.mediaCommand(command, value, source)
        }}
      />
    </>
  )
}
