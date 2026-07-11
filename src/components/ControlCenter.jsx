import { useState, useEffect, useRef, useCallback } from 'react'
import AgentPanel from './AgentPanel'
import MusicPlayer from './MusicPlayer.jsx'

// Leading-and-trailing throttle-debounce helper
function throttleDebounce(func, delay) {
  let timeoutId = null
  let lastArgs = null
  let lastCalled = 0
  return function(...args) {
    const now = Date.now()
    lastArgs = args
    if (now - lastCalled >= delay) {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
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

const FALLBACK_WIFI_NETWORKS = [
  { id: 'n1', name: 'HomeNetwork_5G', strength: 4, secured: true, connected: true, saved: true },
  { id: 'n2', name: 'CoffeeShop_Free', strength: 2, secured: false, connected: false, saved: false },
  { id: 'n3', name: 'Office_WiFi', strength: 3, secured: true, connected: false, saved: true },
]

export default function ControlCenter({
  open,
  onClose,
  onOpenSettings,
  battery,
  mediaVolume = 50,
  onVolumeChange,
  allSessions = [],
  onMediaCommand,
  onOpenClipboard,
  settings = {},
  onSettingsChange,
  media,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
}) {
  const { level = 100, charging = false, available = false, acConnected = false, timeRemaining = '' } = battery || {}
  const [wifi, setWifi] = useState(true)
  const [bluetooth, setBluetooth] = useState(true)
  const [dnd, setDnd] = useState(false)
  const [nightLight, setNightLight] = useState(false)
  const [airplaneMode, setAirplaneMode] = useState(false)
  const [brightness, setBrightness] = useState(72)
  const [showNetworks, setShowNetworks] = useState(false)
  const [wifiNetworks, setWifiNetworks] = useState(FALLBACK_WIFI_NETWORKS)
  const [connectedNetwork, setConnectedNetwork] = useState(FALLBACK_WIFI_NETWORKS[0])
  const [wifiError, setWifiError] = useState(null)
  const [focusMode, setFocusMode] = useState('off')
  const [pendingControls, setPendingControls] = useState({})
  const [connectingNetworkId, setConnectingNetworkId] = useState(null)
  const [screenshotActive, setScreenshotActive] = useState(false)
  const screenshotTimerRef = useRef(null)

  // ─── Sound helpers ────────────────────────────────────────────────────────
  const playWakeChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const now = ctx.currentTime
      osc.frequency.setValueAtTime(523.25, now)
      osc.frequency.setValueAtTime(659.25, now + 0.08)
      osc.frequency.setValueAtTime(783.99, now + 0.16)
      osc.frequency.setValueAtTime(1046.50, now + 0.24)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(now + 0.65)
    } catch (e) { console.warn('Audio chime error:', e) }
  }

  const playPopSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      const now = ctx.currentTime
      osc.frequency.setValueAtTime(600, now)
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.1)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(now + 0.12)
    } catch {}
  }

  // ─── Pending helpers ──────────────────────────────────────────────────────
  const setControlPending = useCallback((control, pending) => {
    setPendingControls(prev => ({ ...prev, [control]: pending }))
  }, [])

  const applySystemControl = useCallback(async (control, value, revert, options = {}) => {
    const track = options.track !== false
    if (track) setControlPending(control, true)
    if (!window.electronAPI?.setSystemControl) {
      if (track) setControlPending(control, false)
      return true
    }
    try {
      const result = await window.electronAPI.setSystemControl(control, value)
      if (result?.ok === false) { revert?.(); return false }
      return true
    } catch { revert?.(); return false }
    finally { if (track) setControlPending(control, false) }
  }, [setControlPending])

  const throttledBrightnessRef = useRef(null)
  if (!throttledBrightnessRef.current) {
    throttledBrightnessRef.current = throttleDebounce((val) => {
      applySystemControl('brightness', val, null, { track: false })
    }, 180)
  }
  const throttledBrightnessIPC = throttledBrightnessRef.current

  // ─── Sync system state on open ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setWifiError(null)
    const syncSystemState = async () => {
      if (window.electronAPI?.getSystemState) {
        try {
          const state = await window.electronAPI.getSystemState()
          if (typeof state.wifi === 'boolean') setWifi(state.wifi)
          if (typeof state.bluetooth === 'boolean') setBluetooth(state.bluetooth)
          if (typeof state.airplaneMode === 'boolean') setAirplaneMode(state.airplaneMode)
          setDnd(!!state.dnd)
          setNightLight(!!state.nightLight)
          setBrightness(Number.isFinite(state.brightness) ? state.brightness : 72)
          if (state.dnd) setFocusMode('work')
          else setFocusMode('off')
        } catch (e) { console.error('Failed to sync system state:', e) }
      }
      if (window.electronAPI?.getWifiNetworks) {
        try {
          const networks = await window.electronAPI.getWifiNetworks()
          if (Array.isArray(networks) && networks.length > 0) {
            setWifiNetworks(networks)
            setConnectedNetwork(networks.find(net => net.connected) || networks[0])
          }
        } catch {}
      }
    }
    syncSystemState()
  }, [open])

  useEffect(() => {
    return () => { if (screenshotTimerRef.current) clearTimeout(screenshotTimerRef.current) }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const isPending = (control) => !!pendingControls[control]

  // ─── Toggle handlers ──────────────────────────────────────────────────────
  const toggleWifi = () => {
    if (isPending('wifi') || isPending('airplaneMode')) return
    const next = !wifi
    if (!next) setShowNetworks(false)
    setWifiError(null)
    setWifi(next)
    applySystemControl('wifi', next, () => setWifi(!next))
  }

  const toggleDnd = () => {
    if (isPending('dnd')) return
    const previous = dnd
    const next = !dnd
    setDnd(next)
    setFocusMode(next ? 'work' : 'off')
    applySystemControl('dnd', next, () => { setDnd(previous); setFocusMode(previous ? 'work' : 'off') })
  }

  const toggleNightLight = () => {
    if (isPending('nightLight')) return
    const next = !nightLight
    setNightLight(next)
    applySystemControl('nightLight', next, () => setNightLight(!next))
  }

  const toggleBluetooth = () => {
    if (isPending('bluetooth') || isPending('airplaneMode')) return
    const next = !bluetooth
    setBluetooth(next)
    applySystemControl('bluetooth', next, () => setBluetooth(!next))
  }

  const toggleAirplaneMode = () => {
    if (isPending('airplaneMode') || isPending('wifi') || isPending('bluetooth')) return
    const next = !airplaneMode
    const prevWifi = wifi
    const prevBluetooth = bluetooth
    setAirplaneMode(next)
    if (next) { setWifi(false); setBluetooth(false); setShowNetworks(false) }
    else { setWifi(true); setBluetooth(true) }
    applySystemControl('airplaneMode', next, () => {
      setAirplaneMode(!next); setWifi(prevWifi); setBluetooth(prevBluetooth)
    })
  }

  const selectFocusMode = (modeId) => {
    if (isPending('dnd')) return
    const previousMode = focusMode
    const previousDnd = dnd
    const isDnd = modeId !== 'off'
    setFocusMode(modeId)
    setDnd(isDnd)
    applySystemControl('dnd', isDnd, () => { setDnd(previousDnd); setFocusMode(previousMode) })
  }

  const selectNetwork = async (network) => {
    if (!wifi || connectingNetworkId) return
    const previous = connectedNetwork
    setConnectingNetworkId(network.id)
    setWifiError(null)
    if (!window.electronAPI?.connectWifiNetwork) {
      await new Promise(resolve => setTimeout(resolve, 800))
      setConnectedNetwork(network)
      setWifiNetworks(networks => networks.map(net => ({ ...net, connected: net.id === network.id })))
      setConnectingNetworkId(null)
      setShowNetworks(false)
      return
    }
    try {
      const result = await window.electronAPI.connectWifiNetwork(network.name)
      if (result?.ok !== false) {
        setConnectedNetwork(network)
        setWifiNetworks(networks => networks.map(net => ({ ...net, connected: net.id === network.id })))
        setShowNetworks(false)
      } else {
        setWifiError(result.error || 'Failed to connect')
      }
    } catch (err) {
      setWifiError(err?.message || 'Failed to connect')
    } finally {
      setConnectingNetworkId(null)
    }
  }

  const takeScreenshot = () => {
    setScreenshotActive(true)
    if (screenshotTimerRef.current) clearTimeout(screenshotTimerRef.current)
    screenshotTimerRef.current = setTimeout(() => setScreenshotActive(false), 900)
    window.electronAPI?.takeScreenshot?.()
  }

  const handleBrightnessChange = (event) => {
    const val = Number(event.target.value)
    setBrightness(val)
    throttledBrightnessIPC(val)
  }

  const handleVolumeInput = (event) => {
    onVolumeChange?.(Number(event.target.value))
  }

  // ─── Settings helper ──────────────────────────────────────────────────────
  const setSetting = (key, value) => {
    onSettingsChange?.(prev => ({ ...prev, [key]: value }))
  }

  return (
    <>
      {!settings.docked && <div className="cc-backdrop" onClick={onClose} />}
      <div
        className={`cc-layout-container ${settings.docked ? 'docked' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: (window.electronAPI && window.electronAPI.platform === 'darwin') ? '38px' : (window.electronAPI ? '8px' : '38px'),
          right: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 8100,
          alignItems: 'flex-end',
        }}
      >
        {/* ── Main Control Center Panel ── */}
        <div className="cc-panel" role="dialog" aria-label="Control Center">

          {/* Header */}
          <div className="cc-header">
            <span className="cc-title">Control Center</span>
            <div className="cc-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

              {/* Dock button */}
              <button
                type="button"
                className={`cc-dock-btn ${settings.docked ? 'active' : ''}`}
                onClick={() => {
                  const nextDock = !settings.docked
                  setSetting('docked', nextDock)
                  if (window.electronAPI?.setPanelLocked) window.electronAPI.setPanelLocked(nextDock)
                }}
                title={settings.docked ? 'Unlock Panel' : 'Dock & Lock'}
              >📌</button>

              {/* Settings button */}
              <button type="button" className="cc-settings-btn" onClick={() => onOpenSettings?.('general')} aria-label="Settings" title="Open Settings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>

              {!settings.docked && (
                <button type="button" className="cc-close" onClick={onClose} aria-label="Close">✕</button>
              )}
            </div>
          </div>

          <div className="cc-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            {/* ── Media Sessions ── */}
            {allSessions.length > 0 && (
              <div className="cc-media-section">
                <div className="cc-media-header">
                  <span>🎵 Background Media</span>
                  <span style={{ fontSize: '9px', opacity: 0.6 }}>({allSessions.length})</span>
                </div>
                <div className="cc-media-list">
                  {allSessions.map((session, idx) => (
                    <div key={idx} className="cc-media-item">
                      <div className="cc-media-art">{session.source === 'Spotify' ? '🎧' : '🎶'}</div>
                      <div className="cc-media-info">
                        <div className="cc-media-title">{session.title}</div>
                        <div className="cc-media-artist">{session.artist} • {session.source}</div>
                      </div>
                      <div className="cc-media-controls">
                        <button type="button" className="cc-media-btn" onClick={() => onMediaCommand?.('prev', null, session.sourceAppId || session.source)}>
                          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6L19 6v12z"/></svg>
                        </button>
                        <button type="button" className="cc-media-btn" onClick={() => onMediaCommand?.('playpause', null, session.sourceAppId || session.source)}>
                          {session.isPlaying
                            ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          }
                        </button>
                        <button type="button" className="cc-media-btn" onClick={() => onMediaCommand?.('next', null, session.sourceAppId || session.source)}>
                          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Network tiles ── */}
            <div className="cc-tile-group cc-network-group">
              <div className={`cc-tile cc-tile-wifi ${wifi ? 'active' : ''} ${isPending('wifi') ? 'pending' : ''}`}>
                <button type="button" id="cc-wifi-toggle" className="cc-tile-inner" onClick={toggleWifi} disabled={isPending('wifi') || isPending('airplaneMode')} aria-pressed={wifi}>
                  <div className="cc-tile-icon"><WifiIcon2 active={wifi} /></div>
                  <div className="cc-tile-info">
                    <div className="cc-tile-name">Wi-Fi</div>
                    <div className="cc-tile-sub">{wifi ? connectedNetwork?.name || 'On' : 'Off'}</div>
                  </div>
                </button>
                {wifi && (
                  <button type="button" id="cc-network-expand" className="cc-tile-expand"
                    onClick={(e) => { e.stopPropagation(); setShowNetworks(v => !v) }}
                    disabled={isPending('wifi') || isPending('airplaneMode')} aria-label="Show networks">
                    <ChevronIcon />
                  </button>
                )}
              </div>

              <button type="button" id="cc-bluetooth" className={`cc-tile cc-tile-half ${bluetooth ? 'active' : ''} ${isPending('bluetooth') ? 'pending' : ''}`}
                onClick={toggleBluetooth} disabled={isPending('bluetooth') || isPending('airplaneMode')} aria-pressed={bluetooth}>
                <div className="cc-tile-icon"><BluetoothIcon active={bluetooth} /></div>
                <div className="cc-tile-info">
                  <div className="cc-tile-name">Bluetooth</div>
                  <div className="cc-tile-sub">{bluetooth ? 'On' : 'Off'}</div>
                </div>
              </button>

              <button type="button" id="cc-airplane" className={`cc-tile cc-tile-half ${airplaneMode ? 'active cc-tile-warning' : ''} ${isPending('airplaneMode') ? 'pending' : ''}`}
                onClick={toggleAirplaneMode} disabled={isPending('airplaneMode') || isPending('wifi') || isPending('bluetooth')} aria-pressed={airplaneMode}>
                <div className="cc-tile-icon">✈️</div>
                <div className="cc-tile-info">
                  <div className="cc-tile-name">Airplane</div>
                  <div className="cc-tile-sub">{airplaneMode ? 'On' : 'Off'}</div>
                </div>
              </button>
            </div>

            {/* Wi-Fi network list */}
            {wifi && showNetworks && (
              <div className="cc-network-list" role="listbox">
                <div className="cc-network-list-title">Available Networks</div>
                {wifiError && <div className="cc-network-error" role="alert">⚠️ {wifiError}</div>}
                {wifiNetworks.map(net => (
                  <button key={net.id} type="button"
                    className={`cc-network-item ${connectedNetwork?.id === net.id ? 'connected' : ''} ${connectingNetworkId === net.id ? 'pending' : ''}`}
                    role="option" aria-selected={connectedNetwork?.id === net.id}
                    disabled={!!connectingNetworkId} onClick={() => selectNetwork(net)}>
                    <WifiSignal strength={net.strength} />
                    <span className="cc-net-name">{net.name}</span>
                    {net.secured && <span className="cc-net-lock">🔒</span>}
                    {net.saved && !net.connected && <span className="cc-net-saved">Saved</span>}
                    {connectingNetworkId === net.id
                      ? <span className="cc-net-spinner" />
                      : connectedNetwork?.id === net.id ? <span className="cc-net-check">✓</span> : null
                    }
                  </button>
                ))}
              </div>
            )}

            {/* ── Focus Mode ── */}
            <div className="cc-tile-group cc-focus-group">
              <div className="cc-focus-label">Focus Mode</div>
              <div className="cc-focus-pills">
                {[
                  { id: 'off', icon: '🔔', label: 'Off' },
                  { id: 'work', icon: '💼', label: 'Work' },
                  { id: 'personal', icon: '🏠', label: 'Personal' },
                  { id: 'sleep', icon: '🌙', label: 'Sleep' },
                ].map(f => (
                  <button key={f.id} type="button"
                    className={`cc-focus-pill ${focusMode === f.id ? 'active' : ''}`}
                    onClick={() => selectFocusMode(f.id)} disabled={isPending('dnd')}
                    aria-pressed={focusMode === f.id} id={`focus-${f.id}`}>
                    <span className="cc-focus-pill-icon">{f.icon}</span>
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Beta Agent Panel ── */}
            {/* ── Music Player ── */}
            {media && (media.title || media.isPlaying) && (
              <div className="cc-music-player-wrap" style={{ margin: '4px 0 10px', width: '100%' }}>
                <MusicPlayer
                  media={media}
                  settings={settings}
                  onPlayPause={onPlayPause}
                  onNext={onNext}
                  onPrev={onPrev}
                  onVolumeChange={onVolumeChange}
                  onSeek={onSeek}
                />
              </div>
            )}

            {/* ── Beta Agent Panel ── */}
            <BetaAgentPanel
              settings={settings}
              onSettingsChange={onSettingsChange}
            />

            {/* ── Sliders ── */}
            <div className="cc-sliders">
              <div className="cc-slider-row">
                <span className="cc-slider-icon"><BrightnessIcon level={brightness} /></span>
                <div className="cc-slider-wrap">
                  <input id="cc-brightness" type="range" min={0} max={100} value={brightness}
                    onInput={handleBrightnessChange} onChange={handleBrightnessChange}
                    className="cc-slider" aria-label="Brightness" />
                </div>
                <span className="cc-slider-val">{brightness}%</span>
              </div>
              <div className="cc-slider-row">
                <span className="cc-slider-icon">{mediaVolume === 0 ? '🔇' : mediaVolume < 40 ? '🔈' : '🔊'}</span>
                <div className="cc-slider-wrap">
                  <input id="cc-volume" type="range" min={0} max={100} value={mediaVolume}
                    onInput={handleVolumeInput} onChange={handleVolumeInput}
                    className="cc-slider" aria-label="Volume" />
                </div>
                <span className="cc-slider-val">{mediaVolume}%</span>
              </div>
            </div>

            {/* ── Quick toggles ── */}
            <div className="cc-quick-grid">
              <QuickTile id="qt-dnd" icon={dnd ? '🔕' : '🔔'} label="DND" active={dnd} disabled={isPending('dnd')} onClick={toggleDnd} />
              <QuickTile id="qt-nightlight" icon="🌙" label="Night Light" active={nightLight} disabled={isPending('nightLight')} onClick={toggleNightLight} />
              <QuickTile id="qt-screenshot" icon="📸" label="Screenshot" active={screenshotActive} onClick={takeScreenshot} />
              <QuickTile id="qt-clipboard" icon="📋" label="Clipboard" active={false} onClick={() => onOpenClipboard?.()} />
            </div>

            {/* ── Battery ── */}
            <div className="cc-battery-status">
              <div className="cc-batt-left">
                <div className="cc-batt-icon-wrap">
                  <div className="cc-batt-bar" style={{ width: `${level}%`, background: level > 20 ? '#4ade80' : '#f87171' }} />
                </div>
                <div className="cc-batt-meta">
                  <span className="cc-batt-pct">{level}%</span>
                  <span className="cc-batt-state">
                    {charging ? 'Charging' : acConnected ? 'Plugged In' : 'Discharging'}
                    {timeRemaining && ` · ${timeRemaining}`}
                  </span>
                </div>
              </div>
              <div className="cc-batt-history">
                {[65,70,74,73,level].map((v,i) => (
                  <div key={i} className="cc-batt-bar-mini" style={{ height: `${v * 0.28}px` }} />
                ))}
              </div>
            </div>

            <div className="cc-handle" />
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Beta Agent Panel ─────────────────────────────────────────────────────────

function BetaAgentPanel({ settings = {}, onSettingsChange }) {
  const enabled = settings.betaModeEnabled

  return (
    <div className="cc-beta-card">
      {/* Header */}
      <div className="cc-beta-card-header" style={{ borderBottom: enabled ? '1px solid rgba(124, 106, 247, 0.12)' : 'none', paddingBottom: enabled ? '10px' : '0' }}>
        <div className="cc-beta-card-title-wrap">
          <span className="cc-beta-card-icon">⚡</span>
          <span className="cc-beta-card-title">Beta Agent</span>
        </div>
        <div className="cc-beta-card-status">
          <span className={`cc-beta-card-dot ${enabled ? 'active' : 'inactive'}`} />
          <span className="cc-beta-card-text" style={{ color: enabled ? '#4ade80' : 'var(--color-text-muted)', fontSize: '10px' }}>
            {enabled ? 'Voice Active' : 'Text Only'}
          </span>
          <div
            className={`cc-beta-card-toggle ${enabled ? 'on' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onSettingsChange?.(prev => {
                const nextVal = !prev.betaModeEnabled
                return { ...prev, betaModeEnabled: nextVal, soundEnabled: nextVal ? true : prev.soundEnabled }
              })
            }}
            role="switch"
            aria-checked={enabled}
            tabIndex={0}
            style={{
              width: '28px',
              height: '16px',
              borderRadius: '8px',
              background: enabled ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${enabled ? 'var(--color-accent)' : 'rgba(255,255,255,0.12)'}`,
              position: 'relative',
              cursor: 'pointer',
              marginLeft: '6px'
            }}
          >
            <div style={{
              position: 'absolute',
              top: '1px',
              left: '1px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#fff',
              transform: enabled ? 'translateX(12px)' : 'none',
              transition: 'transform 0.2s ease-in-out'
            }} />
          </div>
        </div>
      </div>

      {/* ── AI Agent Panel ── */}
      {enabled && (
        <div className="beta-agent-wrapper" style={{ padding: '4px 0 0' }}>
          <AgentPanel settings={settings} />
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function QuickTile({ id, icon, label, active, disabled = false, onClick }) {
  return (
    <button type="button" id={id} className={`qt-tile ${active ? 'active' : ''}`}
      onClick={onClick} disabled={disabled} aria-pressed={active} title={label}>
      <span className="qt-icon">{icon}</span>
      <span className="qt-label">{label}</span>
    </button>
  )
}

function WifiIcon2({ active }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
      <path d="M12 3C7.79 3 3.98 4.72 1.23 7.5L2.66 8.93C5.04 6.53 8.35 5 12 5s6.96 1.53 9.34 3.93l1.43-1.43C20.02 4.72 16.21 3 12 3zm0 4c-3.19 0-6.06 1.3-8.14 3.39L5.3 11.83C6.99 10.1 9.37 9 12 9s5.01 1.1 6.7 2.83l1.44-1.44C18.06 8.3 15.19 7 12 7zm0 4c-2.21 0-4.21.9-5.66 2.34L7.78 14.8C8.83 13.74 10.34 13 12 13s3.17.74 4.22 1.8l1.44-1.46C16.21 11.9 14.21 11 12 11zm0 4c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
    </svg>
  )
}

function BluetoothIcon({ active }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ opacity: active ? 1 : 0.35 }}>
      <path d="M17.71 7.71 12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
    </svg>
  )
}

function BrightnessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"/>
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
    </svg>
  )
}

function WifiSignal({ strength }) {
  return (
    <div className="cc-wifi-signal" aria-label={`Signal strength ${strength}/4`}>
      {[1,2,3,4].map(i => (
        <div key={i} className={`cc-signal-bar ${i <= strength ? 'filled' : ''}`} style={{ height: `${4 + i * 3}px` }} />
      ))}
    </div>
  )
}
