import { useState, useEffect, useCallback, useRef } from 'react'
import NotchBar from './components/NotchBar.jsx'
import VolumeHUD from './components/VolumeHUD.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'

// ─── Mock media state (used when Windows SMTC is unavailable) ──────────────

const TRACKS = [
  {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    albumArt: null,
    source: 'Spotify',
    duration: 200,
  },
  {
    title: 'Save Your Tears',
    artist: 'The Weeknd',
    album: 'After Hours',
    albumArt: null,
    source: 'Spotify',
    duration: 215,
  },
  {
    title: 'Starboy',
    artist: 'The Weeknd ft. Daft Punk',
    album: 'Starboy',
    albumArt: null,
    source: 'Spotify',
    duration: 230,
  },
]

const INITIAL_MEDIA = {
  ...TRACKS[0],
  isPlaying: true,
  volume: 72,
  position: 45,
  trackIndex: 0,
}

const isElectron = !!window.electronAPI

export default function App() {
  const [media, setMedia] = useState(INITIAL_MEDIA)
  const [battery, setBattery] = useState({ level: 78, charging: false, available: true })
  const [volumeHUD, setVolumeHUD] = useState({ visible: false, level: 72 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const volumeTimerRef = useRef(null)
  const positionTimerRef = useRef(null)

  // ── Battery polling ──────────────────────────────────────────────────────
  useEffect(() => {
    const fetchBattery = async () => {
      if (isElectron) {
        try {
          const info = await window.electronAPI.getBattery()
          if (info) setBattery(info)
        } catch { /* use initial mock */ }
      } else if (navigator.getBattery) {
        try {
          const bat = await navigator.getBattery()
          const update = () =>
            setBattery({ level: Math.round(bat.level * 100), charging: bat.charging, available: true })
          update()
          bat.addEventListener('levelchange', update)
          bat.addEventListener('chargingchange', update)
          return () => {
            bat.removeEventListener('levelchange', update)
            bat.removeEventListener('chargingchange', update)
          }
        } catch { /* use mock */ }
      }
    }
    fetchBattery()
    const id = setInterval(fetchBattery, 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Settings trigger from tray ────────────────────────────────────────────
  useEffect(() => {
    if (!window.electronAPI?.onOpenSettings) return
    const unsub = window.electronAPI.onOpenSettings(() => setSettingsOpen(true))
    return unsub
  }, [])

  // ── Media position ticker ─────────────────────────────────────────────────
  useEffect(() => {
    if (!media.isPlaying) {
      clearInterval(positionTimerRef.current)
      return
    }
    positionTimerRef.current = setInterval(() => {
      setMedia(m => {
        const next = m.position + 1
        if (next >= m.duration) {
          // auto-advance track
          handleNext()
          return m
        }
        return { ...m, position: next }
      })
    }, 1000)
    return () => clearInterval(positionTimerRef.current)
  }, [media.isPlaying, media.trackIndex])

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
    setMedia(m => ({ ...m, isPlaying: !m.isPlaying }))
  }, [])

  const handleNext = useCallback(() => {
    setMedia(m => {
      const nextIdx = (m.trackIndex + 1) % TRACKS.length
      return { ...m, ...TRACKS[nextIdx], trackIndex: nextIdx, position: 0, isPlaying: true }
    })
  }, [])

  const handlePrev = useCallback(() => {
    setMedia(m => {
      if (m.position > 3) return { ...m, position: 0 }
      const prevIdx = (m.trackIndex - 1 + TRACKS.length) % TRACKS.length
      return { ...m, ...TRACKS[prevIdx], trackIndex: prevIdx, position: 0 }
    })
  }, [])

  const handleVolumeChange = useCallback((level) => {
    setMedia(m => ({ ...m, volume: level }))
    showVolumeHUD(level)
  }, [showVolumeHUD])

  const handleSeek = useCallback((position) => {
    setMedia(m => ({ ...m, position }))
  }, [])

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
        onSettingsOpen={() => setSettingsOpen(true)}
      />
      <VolumeHUD visible={volumeHUD.visible} level={volumeHUD.level} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
