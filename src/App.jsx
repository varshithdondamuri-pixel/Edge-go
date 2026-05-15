import { useState, useEffect, useCallback, useRef } from 'react'
import NotchBar from './components/NotchBar.jsx'
import VolumeHUD from './components/VolumeHUD.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import ClipboardDock from './components/ClipboardDock.jsx'
import ControlCenter from './components/ControlCenter.jsx'

// ─── Default media state ──────────────

const INITIAL_MEDIA = {
  title: 'No media playing',
  artist: 'Unknown',
  album: '',
  albumArt: null,
  source: null,
  duration: 0,
  isPlaying: false,
  volume: 50,
  position: 0,
}

const isElectron = !!window.electronAPI

export default function App() {
  const [media, setMedia] = useState(INITIAL_MEDIA)
  const [allSessions, setAllSessions] = useState([])
  const [battery, setBattery] = useState({ level: 78, charging: false, available: true })
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('edge-go-settings')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

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


  // ── Settings Sync ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron || !window.electronAPI.onSettingsUpdated) return
    return window.electronAPI.onSettingsUpdated((newSettings) => {
      setSettings(newSettings)
      // Also save to local storage for persistence on this window
      localStorage.setItem('edge-go-settings', JSON.stringify(newSettings))
    })
  }, [])

  // ── Apply Settings to Root ───────────────────────────────────────────────
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
      root.style.setProperty('--is-dark', settings.darkMode ? '1' : '0')
      if (settings.darkMode) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }, [settings])

  // ── Real Media polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron || !window.electronAPI.getMediaInfo) return
    let isMounted = true
    const fetchMedia = async () => {
      try {
        const info = await window.electronAPI.getMediaInfo()
        if (isMounted) {
          if (Array.isArray(info)) {
            setAllSessions(info)
            // "Spotify Priority" logic:
            const spotify = info.find(s => s.source?.toLowerCase().includes('spotify') && s.isPlaying)
            const active = info.find(s => s.isPlaying)
            setMedia(spotify || active || info[0] || INITIAL_MEDIA)
          } else if (info) {
            setAllSessions([info])
            setMedia(info)
          } else {
            setAllSessions([])
            setMedia(INITIAL_MEDIA)
          }
        }
      } catch (err) {
        // ignore
      }
    }
    fetchMedia()
    const id = setInterval(fetchMedia, 1000)
    return () => {
      isMounted = false
      clearInterval(id)
    }
  }, [])

  // ── Media position ticker ─────────────────────────────────────────────────
  // Replaced by real media polling above! But we keep this just for smooth UI updates between polls if playing.
  useEffect(() => {
    if (!media.isPlaying || media.duration === 0) {
      clearInterval(positionTimerRef.current)
      return
    }
    positionTimerRef.current = setInterval(() => {
      setMedia(m => {
        const next = m.position + 1
        if (next >= m.duration) {
          return m
        }
        return { ...m, position: next }
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
    if (isElectron && window.electronAPI.mediaCommand) {
      window.electronAPI.mediaCommand('next', null, media.source)
    }
  }, [media.source])

  const handlePrev = useCallback(() => {
    if (isElectron && window.electronAPI.mediaCommand) {
      window.electronAPI.mediaCommand('prev', null, media.source)
    }
  }, [media.source])

  const handleVolumeChange = useCallback((level) => {
    if (isElectron && window.electronAPI.mediaCommand) {
      window.electronAPI.mediaCommand('volume', level, media.source)
    }
    setMedia(m => ({ ...m, volume: level }))
    showVolumeHUD(level)
  }, [showVolumeHUD, media.source])

  const handleSeek = useCallback((position) => {
    if (isElectron && window.electronAPI.mediaCommand) {
      window.electronAPI.mediaCommand('seek', position, media.source)
    }
    setMedia(m => ({ ...m, position }))
  }, [media.source])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'AudioVolumeUp') {
        setMedia(m => {
          const v = Math.min(100, m.volume + 5)
          showVolumeHUD(v)
          return { ...m, volume: v }
        })
      } else if (e.key === 'AudioVolumeDown') {
        setMedia(m => {
          const v = Math.max(0, m.volume - 5)
          showVolumeHUD(v)
          return { ...m, volume: v }
        })
      } else if (e.key === 'AudioVolumeMute') {
        setMedia(m => {
          const v = m.volume > 0 ? 0 : 50
          showVolumeHUD(v)
          return { ...m, volume: v }
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showVolumeHUD])

  useEffect(() => {
    if (isElectron && window.electronAPI.setControlCenter) {
      window.electronAPI.setControlCenter(controlCenterOpen)
    }
  }, [controlCenterOpen])

  if (isSettingsRoute) {
    return (
      <SettingsPanel 
        open={true} 
        onClose={() => window.electronAPI?.closeSettings()} 
        initialTab={settingsTab} 
        isStandalone={true}
        settings={settings}
        onSettingsChange={setSettings}
      />
    )
  }

  return (
    <>
      <NotchBar
        media={media}
        battery={battery}
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
          if (isElectron && window.electronAPI.mediaCommand) {
            window.electronAPI.mediaCommand(command, value, source)
          }
        }}
      />
    </>
  )
}
