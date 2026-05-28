import { useState, useEffect, useCallback, useRef } from 'react'
import NotchBar from './components/NotchBar.jsx'
import VolumeHUD from './components/VolumeHUD.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import ClipboardDock from './components/ClipboardDock.jsx'
import ControlCenter from './components/ControlCenter.jsx'
import {
  applySettingsToDocument,
  loadStoredSettings,
  normalizeSettings,
  saveStoredSettings,
  settingsEqual,
} from './defaultSettings.js'

// ─── Default media state ──────────────

const INITIAL_MEDIA = {
  title: '',
  artist: '',
  album: '',
  albumArt: null,
  source: null,
  sourceAppId: null,
  isCurrent: false,
  duration: 0,
  isPlaying: false,
  volume: 50,
  position: 0,
}

const isElectron = !!window.electronAPI

function filterMediaSessions(sessions, settings) {
  const s = normalizeSettings(settings)
  return sessions.filter(session => {
    const sourceText = [
      session.source,
      session.sourceAppId,
      session.title,
      session.artist,
    ].filter(Boolean).join(' ').toLowerCase()
    const browserSource = ['chrome', 'edge', 'firefox', 'browser', 'msedge'].some(name => sourceText.includes(name))
    const windowsMediaSource = ['windows media', 'groove', 'zune', 'wmplayer', 'vlc', 'media.player'].some(name => sourceText.includes(name))

    if (!s.spotifyEnabled && sourceText.includes('spotify')) return false
    if (!s.browserEnabled && browserSource) return false
    if (!s.youtubeEnabled && sourceText.includes('youtube')) return false
    if (!s.windowsMediaEnabled && windowsMediaSource) return false
    return true
  })
}

export default function App() {
  const [media, setMedia] = useState(INITIAL_MEDIA)
  const [allSessions, setAllSessions] = useState([])
  const [battery, setBattery] = useState({ level: 100, charging: false, available: false })
  const [settings, setSettings] = useState(loadStoredSettings)

  // ── Routing ───────────────────────────────────────────────────────────────
  const [route, setRoute] = useState(window.location.hash)
  const [controlCenterOpen, setControlCenterOpen] = useState(false)
  const [clipboardOpen, setClipboardOpen] = useState(false)
  const [volumeHUD, setVolumeHUD] = useState({ visible: false, level: 50 })

  const positionTimerRef = useRef(null)
  const volumeTimerRef = useRef(null)
  const remoteSettingsRef = useRef(false)

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const isSettingsRoute = route.startsWith('#settings')
  const settingsTab = new URLSearchParams(route.split('?')[1]).get('tab') || 'general'
  useEffect(() => {
    document.documentElement.classList.toggle('settings-root', isSettingsRoute)
  }, [isSettingsRoute])

  // ── Settings Sync (from main window → settings window via IPC) ──────────
  useEffect(() => {
    if (!isElectron || !window.electronAPI.onSettingsUpdated) return
    return window.electronAPI.onSettingsUpdated((newSettings) => {
      const merged = normalizeSettings(newSettings)
      setSettings(prev => {
        if (settingsEqual(prev, merged)) return prev
        remoteSettingsRef.current = true
        return merged
      })
      saveStoredSettings(merged)
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
    saveStoredSettings(settings)
    if (remoteSettingsRef.current) {
      remoteSettingsRef.current = false
      prevSettingsRef.current = settings
      return
    }
    if (isElectron && window.electronAPI?.updateSettings && !settingsEqual(prevSettingsRef.current, settings)) {
      window.electronAPI.updateSettings(settings)
    }
    prevSettingsRef.current = settings
  }, [settings])

  // ── Apply Settings to Root DOM ───────────────────────────────────────────
  useEffect(() => {
    applySettingsToDocument(settings)
  }, [settings])

  // ── Apply native window settings only from the notch window ───────────────
  useEffect(() => {
    if (!isElectron || isSettingsRoute) return
    window.electronAPI?.setNotchPosition?.(settings.notchPosition, settings.collapsedWidth)
  }, [isSettingsRoute, settings.notchPosition, settings.collapsedWidth])

  useEffect(() => {
    if (!isElectron || isSettingsRoute) return
    window.electronAPI?.setAlwaysOnTop?.(settings.alwaysOnTop)
    window.electronAPI?.setShowInTaskbar?.(settings.showInTaskbar)
    window.electronAPI?.setWindowEffects?.({
      enableWindowShadow: settings.enableWindowShadow,
      transparencyEffects: settings.transparencyEffects,
    })
  }, [
    isSettingsRoute,
    settings.alwaysOnTop,
    settings.showInTaskbar,
    settings.enableWindowShadow,
    settings.transparencyEffects,
  ])

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
    let inFlight = false

    const applyMediaSessions = (info) => {
      if (!isMounted) return
      const sessions = Array.isArray(info) ? filterMediaSessions(info, settings) : []
      if (sessions.length > 0) {
        setAllSessions(sessions)
        const currentPlaying = sessions.find(s => s.isCurrent && s.isPlaying)
        const current        = sessions.find(s => s.isCurrent)
        const spotify        = sessions.find(s => s.source?.toLowerCase().includes('spotify') && s.isPlaying)
        const active         = sessions.find(s => s.isPlaying)
        setMedia(currentPlaying || spotify || active || current || sessions[0] || INITIAL_MEDIA)
      } else {
        setAllSessions([])
        setMedia(INITIAL_MEDIA)
      }
    }

    // Initial fetch
    const fetchMedia = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const info = await window.electronAPI.getMediaInfo()
        applyMediaSessions(info)
      } catch {} finally { inFlight = false }
    }

    fetchMedia()
    const pollMs = (settings.mediaPollingInterval || 2) * 1000
    const id = setInterval(fetchMedia, pollMs)

    // Also respond to push updates from Electron main (instant, no poll lag)
    let unsubPush = null
    if (window.electronAPI.onMediaUpdate) {
      unsubPush = window.electronAPI.onMediaUpdate((info) => applyMediaSessions(info))
    }

    return () => {
      isMounted = false
      clearInterval(id)
      if (unsubPush) unsubPush()
    }
  }, [
    settings.mediaPollingInterval,
    settings.spotifyEnabled,
    settings.browserEnabled,
    settings.youtubeEnabled,
    settings.windowsMediaEnabled,
  ])

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
      window.electronAPI.mediaCommand('playpause', null, media.sourceAppId || media.source)
      setMedia(m => ({ ...m, isPlaying: !m.isPlaying }))
    }
  }, [media.source, media.sourceAppId])

  const handleNext = useCallback(() => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('next', null, media.sourceAppId || media.source)
  }, [media.source, media.sourceAppId])

  const handlePrev = useCallback(() => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('prev', null, media.sourceAppId || media.source)
  }, [media.source, media.sourceAppId])

  const handleVolumeChange = useCallback((level) => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('volume', level, media.sourceAppId || media.source)
    setMedia(m => ({ ...m, volume: level }))
    showVolumeHUD(level)
  }, [showVolumeHUD, media.source, media.sourceAppId])

  const handleSeek = useCallback((position) => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('seek', position, media.sourceAppId || media.source)
    setMedia(m => ({ ...m, position }))
  }, [media.source, media.sourceAppId])

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

  // ── Control Center / Clipboard window resize ──────────────────────────────
  useEffect(() => {
    if (!isSettingsRoute && isElectron && window.electronAPI.setControlCenter) {
      window.electronAPI.setControlCenter(controlCenterOpen || clipboardOpen)
    }
  }, [controlCenterOpen, clipboardOpen, isSettingsRoute])

  // ── Close overlays on focus loss (window blur) ──────────────────────────
  useEffect(() => {
    const handleBlur = () => {
      setControlCenterOpen(false)
      setClipboardOpen(false)
    }
    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [])

  useEffect(() => {
    if (!isElectron) return undefined
    const cleanups = [
      window.electronAPI?.onOpenControlCenter?.(() => setControlCenterOpen(true)),
      window.electronAPI?.onOpenClipboard?.(() => setClipboardOpen(true)),
    ].filter(Boolean)
    return () => cleanups.forEach(cleanup => cleanup())
  }, [])

  // ── Settings route (standalone settings window) ──────────────────────────
  if (isSettingsRoute) {
    return (
      <SettingsPanel
        open={true}
        onClose={() => {
          if (window.electronAPI?.closeSettings) window.electronAPI.closeSettings()
          else window.location.hash = ''
        }}
        initialTab={settingsTab}
        isStandalone={true}
        settings={settings}
        onSettingsChange={(updater) => {
          setSettings(prev => {
            const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
            saveStoredSettings(next)
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
        isOverlayOpen={controlCenterOpen || clipboardOpen}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        onVolumeChange={handleVolumeChange}
        onSeek={handleSeek}
        onSettingsOpen={() => window.electronAPI?.openSettings('general')}
        onClipboardOpen={() => setClipboardOpen(true)}
        onControlCenterOpen={() => setControlCenterOpen(true)}
      />
      {settings.volumeHUD !== false && <VolumeHUD visible={volumeHUD.visible} level={volumeHUD.level} />}
      <ClipboardDock open={clipboardOpen} onClose={() => setClipboardOpen(false)} />
      <ControlCenter
        open={controlCenterOpen}
        onClose={() => setControlCenterOpen(false)}
        onOpenSettings={(tab) => {
          window.electronAPI?.openSettings(tab || 'general')
          setControlCenterOpen(false)
        }}
        onOpenClipboard={() => {
          setControlCenterOpen(false)
          setClipboardOpen(true)
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
