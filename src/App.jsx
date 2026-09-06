import { useState, useEffect, useCallback, useRef } from 'react'
import NotchBar from './components/NotchBar.jsx'
import VolumeHUD from './components/VolumeHUD.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import ClipboardDock from './components/ClipboardDock.jsx'
import ControlCenter from './components/ControlCenter.jsx'
import NotchSyncBridge from './components/NotchSyncBridge.jsx'
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

// Media polling hands back a fresh object every couple of seconds. Without a
// value check that re-rendered the whole tree (notch, player, Control Center)
// on every poll even when nothing about the track had changed.
const MEDIA_COMPARE_KEYS = [
  'title', 'artist', 'album', 'albumArt', 'source', 'sourceAppId',
  'isCurrent', 'duration', 'isPlaying', 'position',
]

function mediaEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return MEDIA_COMPARE_KEYS.every(key => a[key] === b[key])
}

function sessionsEqual(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((session, i) => mediaEqual(session, b[i]))
}

// Leading-and-trailing throttle-debounce helper
function throttleDebounce(func, delay) {
  let timeoutId = null
  let lastArgs = null
  let lastCalled = 0

  return function(...args) {
    const now = Date.now()
    lastArgs = args

    if (now - lastCalled >= delay) {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      func.apply(this, args)
      lastCalled = now
    } else {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        func.apply(this, lastArgs)
        lastCalled = Date.now()
        timeoutId = null
      }, delay - (now - lastCalled))
    }
  }
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
  const [syncBridgeOpen, setSyncBridgeOpen] = useState(false)
  const [wakeActive, setWakeActive] = useState(false)
  const [volumeHUD, setVolumeHUD] = useState({ visible: false, level: 50 })

  const positionTimerRef = useRef(null)
  const volumeTimerRef = useRef(null)
  const wakeTimerRef = useRef(null)
  const remoteSettingsRef = useRef(false)

  useEffect(() => {
    const isMac = isElectron
      ? window.electronAPI.platform === 'darwin'
      : /Mac/i.test(window.navigator.platform || '')
    if (isMac) {
      document.documentElement.classList.add('platform-darwin')
    }

  }, [])

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

  // The microphone is only ever used by the Beta voice agent. The base build
  // must never pop a system mic-permission prompt, so this waits for Beta mode
  // to actually be on (and only asks once per session).
  const micRequestedRef = useRef(false)
  useEffect(() => {
    if (isSettingsRoute || !settings.betaModeEnabled || micRequestedRef.current) return
    micRequestedRef.current = true
    const initMicPermission = async () => {
      try {
        if (window.electronAPI?.requestMicPermission) {
          await window.electronAPI.requestMicPermission()
        }
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach(track => track.stop())
        }
      } catch (e) {
        console.warn('[App] Microphone access request error/denied:', e)
      }
    }
    initMicPermission()
  }, [settings.betaModeEnabled, isSettingsRoute])

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

  // ── Load saved settings from disk (via IPC) on startup ───────────────────
  useEffect(() => {
    if (isElectron && window.electronAPI.getSettings) {
      window.electronAPI.getSettings().then(saved => {
        if (saved) {
          const merged = normalizeSettings(saved)
          setSettings(prev => {
            if (settingsEqual(prev, merged)) return prev
            remoteSettingsRef.current = true
            return merged
          })
          saveStoredSettings(merged)
        }
      }).catch(err => console.error('[Settings] Failed to fetch settings:', err))
    }
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
        setAllSessions(prev => (sessionsEqual(prev, sessions) ? prev : sessions))
        const currentPlaying = sessions.find(s => s.isCurrent && s.isPlaying)
        const current        = sessions.find(s => s.isCurrent)
        const spotify        = sessions.find(s => s.source?.toLowerCase().includes('spotify') && s.isPlaying)
        const active         = sessions.find(s => s.isPlaying)
        const selected = currentPlaying || spotify || active || current || sessions[0] || INITIAL_MEDIA
        const validTrack = selected.title && selected.title !== 'No media playing'
        const isFirstLoad = !prevTitleRef.current
        const titleChanged = validTrack && selected.title !== prevTitleRef.current
        const artChanged = selected.albumArt && selected.albumArt !== prevAlbumArtRef.current
        
        if (isFirstLoad && validTrack) {
          prevTitleRef.current = selected.title
          prevAlbumArtRef.current = selected.albumArt || ''
        } else if (titleChanged || artChanged) {
          prevTitleRef.current = selected.title
          prevAlbumArtRef.current = selected.albumArt || ''
          if (settings.sneakPeek !== false && selected.isPlaying) {
            setSneakPeekBanner({
              title: selected.title,
              artist: selected.artist || '',
              albumArt: selected.albumArt || null,
              source: selected.source || 'Now Playing',
            })
          }
        }
        setMedia(prev => {
          const next = { ...selected, volume: prev.volume ?? selected.volume ?? 50 }
          return mediaEqual(prev, next) ? prev : next
        })
      } else {
        setAllSessions(prev => (prev.length === 0 ? prev : []))
        setMedia(prev => {
          const next = { ...INITIAL_MEDIA, volume: prev.volume ?? 50 }
          return mediaEqual(prev, next) ? prev : next
        })
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

  // ── System volume sync ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return

    // Fetch initial volume
    if (window.electronAPI.getSystemVolume) {
      window.electronAPI.getSystemVolume().then(level => {
        if (Number.isFinite(level)) {
          setMedia(m => ({ ...m, volume: Math.max(0, Math.min(100, level)) }))
        }
      }).catch(() => {})
    }

    // Subscribe to real-time volume updates
    if (window.electronAPI.onVolumeUpdated) {
      const unsub = window.electronAPI.onVolumeUpdated((level) => {
        if (Number.isFinite(level)) {
          setMedia(m => ({ ...m, volume: Math.max(0, Math.min(100, level)) }))
        }
      })
      return unsub
    }
  }, [])

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

  const [sneakPeekBanner, setSneakPeekBanner] = useState(null)
  const prevTitleRef = useRef('')
  const prevAlbumArtRef = useRef('')
  const clearSneakPeekBanner = useCallback(() => setSneakPeekBanner(null), [])

  const throttledVolumeIPC = useRef(
    throttleDebounce((level, sourceAppId, source) => {
      if (isElectron && window.electronAPI.mediaCommand) {
        window.electronAPI.mediaCommand('volume', level, sourceAppId || source)
      }
    }, 50)
  ).current

  const handleVolumeChange = useCallback((level) => {
    const nextLevel = Math.max(0, Math.min(100, Number(level) || 0))
    setMedia(m => ({ ...m, volume: nextLevel }))
    showVolumeHUD(nextLevel)
    throttledVolumeIPC(nextLevel, media.sourceAppId, media.source)
  }, [showVolumeHUD, media.source, media.sourceAppId, throttledVolumeIPC])

  const handleSeek = useCallback((position) => {
    if (isElectron && window.electronAPI.mediaCommand)
      window.electronAPI.mediaCommand('seek', position, media.sourceAppId || media.source)
    setMedia(m => ({ ...m, position }))
  }, [media.source, media.sourceAppId])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'AudioVolumeUp') {
        setMedia(m => {
          const v = Math.min(100, m.volume + 5)
          showVolumeHUD(v)
          throttledVolumeIPC(v, m.sourceAppId, m.source)
          return { ...m, volume: v }
        })
      } else if (e.key === 'AudioVolumeDown') {
        setMedia(m => {
          const v = Math.max(0, m.volume - 5)
          showVolumeHUD(v)
          throttledVolumeIPC(v, m.sourceAppId, m.source)
          return { ...m, volume: v }
        })
      } else if (e.key === 'AudioVolumeMute') {
        setMedia(m => {
          const v = m.volume > 0 ? 0 : 50
          showVolumeHUD(v)
          throttledVolumeIPC(v, m.sourceAppId, m.source)
          return { ...m, volume: v }
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showVolumeHUD, throttledVolumeIPC])

  // ── Control Center / Clipboard window resize ──────────────────────────────
  // Every overlay that needs the big window counts here. This used to be two
  // separate effects sending set-control-center with different values on the
  // same render, so the main process resized the window twice (and re-focused
  // it) for every toggle.
  const isOverlayOpen = controlCenterOpen || clipboardOpen || syncBridgeOpen || wakeActive
  useEffect(() => {
    if (isSettingsRoute || !isElectron) return
    window.electronAPI.setControlCenter?.(isOverlayOpen)
    window.electronAPI.setControlCenterDocked?.(!!(settings.docked && controlCenterOpen))
  }, [isOverlayOpen, controlCenterOpen, settings.docked, isSettingsRoute])

  // ── Close overlays on focus loss (window blur) ──────────────────────────
  useEffect(() => {
    let timeoutId = null
    const handleBlur = (e) => {
      // Don't auto-dismiss if Control Center/Sync Bridge is open, docked, or wake active
      if (settings.docked || controlCenterOpen || clipboardOpen || syncBridgeOpen || wakeActive) return
      timeoutId = setTimeout(() => {
        setControlCenterOpen(false)
        setClipboardOpen(false)
      }, 300)
    }
    const handleFocus = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [settings.docked, controlCenterOpen, clipboardOpen, syncBridgeOpen, wakeActive])

  useEffect(() => {
    if (!isElectron) return undefined
    const cleanups = [
      window.electronAPI?.onOpenControlCenter?.(() => setControlCenterOpen(true)),
      window.electronAPI?.onOpenClipboard?.(() => setClipboardOpen(true)),
      window.electronAPI?.onAgentMsg?.((data) => {
        if (!data) return
        if (data.type === 'wake' || data.type === 'voice_query' || data.type === 'thought' || data.type === 'subagent_start') {
          setControlCenterOpen(true)
          setWakeActive(true)
          if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
          wakeTimerRef.current = setTimeout(() => {
            setWakeActive(false)
          }, 15000)
        } else if (data.type === 'done' || data.type === 'error') {
          if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
          wakeTimerRef.current = setTimeout(() => {
            setWakeActive(false)
          }, 8000)
        }
      }),
    ].filter(Boolean)
    return () => {
      cleanups.forEach(cleanup => cleanup())
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current)
    }
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
        sneakPeekBanner={sneakPeekBanner}
        onClearBanner={clearSneakPeekBanner}
        isOverlayOpen={isOverlayOpen}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        onVolumeChange={handleVolumeChange}
        onSeek={handleSeek}
        onSettingsOpen={() => {
          if (window.electronAPI?.openSettings) window.electronAPI.openSettings('general')
          else window.location.hash = '#settings?tab=general'
        }}
        onClipboardOpen={() => setClipboardOpen(true)}
        onControlCenterOpen={() => setControlCenterOpen(true)}
        onSyncBridgeOpen={() => setSyncBridgeOpen(true)}
      />
      {settings.volumeHUD !== false && <VolumeHUD visible={volumeHUD.visible} level={volumeHUD.level} />}
      <ClipboardDock open={clipboardOpen} onClose={() => setClipboardOpen(false)} />
      <NotchSyncBridge
        open={syncBridgeOpen}
        onClose={() => setSyncBridgeOpen(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
      <ControlCenter
        open={controlCenterOpen}
        onClose={() => setControlCenterOpen(false)}
        onOpenSettings={(tab) => {
          if (window.electronAPI?.openSettings) window.electronAPI.openSettings(tab || 'general')
          else window.location.hash = `#settings?tab=${tab || 'general'}`
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
        settings={settings}
        onSettingsChange={setSettings}
        media={media}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        onSeek={handleSeek}
      />
    </>
  )
}
