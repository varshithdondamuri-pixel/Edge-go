import { useState, useEffect, useRef, useCallback } from 'react'
import MusicPlayer from './MusicPlayer.jsx'
import Clock from './Clock.jsx'
import BatteryIndicator from './BatteryIndicator.jsx'
import CalendarMini from './CalendarMini.jsx'
import SystemMonitor from './SystemMonitor.jsx'

const isElectron = !!window.electronAPI

// ── Source icon map (Windows apps) ─────────────────────────────────────────
function SourceConnector({ source }) {
  const map = {
    Spotify:         { emoji: '🎵', color: '#1DB954', label: 'Spotify' },
    'Chrome':        { emoji: '🌐', color: '#4285F4', label: 'Chrome' },
    'Edge':          { emoji: '🌐', color: '#0078D4', label: 'Edge' },
    'Firefox':       { emoji: '🌐', color: '#FF7139', label: 'Firefox' },
    'VLC':           { emoji: '🎬', color: '#FF8800', label: 'VLC' },
    'Groove Music':  { emoji: '🎵', color: '#7c6af7', label: 'Groove' },
    'Windows Media': { emoji: '🎵', color: '#0078D4', label: 'WMP' },
    'Browser':       { emoji: '🌐', color: '#4285F4', label: 'Browser' },
    'Media':         { emoji: '🎵', color: '#7c6af7', label: 'Media' },
  }
  const info = map[source] || { emoji: '🎵', color: '#7c6af7', label: source || 'Media' }

  return (
    <div className="source-connector" style={{ '--src-color': info.color }}>
      <span className="src-dot" />
      <span className="src-emoji">{info.emoji}</span>
      <span className="src-label">{info.label}</span>
      <span className="src-live">LIVE</span>
    </div>
  )
}

export default function NotchBar({
  media, battery, settings = {}, isOverlayOpen,
  sneakPeekBanner, onClearBanner,
  onPlayPause, onNext, onPrev,
  onVolumeChange, onSeek,
  onSettingsOpen,
  onClipboardOpen,
  onControlCenterOpen,
  onSyncBridgeOpen,
}) {
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [activeBanner, setActiveBanner] = useState(null)
  const collapseTimer = useRef(null)
  const expandTimer = useRef(null)
  const bannerTimer = useRef(null)
  const hoveringRef = useRef(false)
  const wasOverlayOpenRef = useRef(false)
  const safeMedia = media || {}
  const miniTitle = safeMedia.title || 'No media playing'

  useEffect(() => {
    if (sneakPeekBanner) {
      setActiveBanner(sneakPeekBanner)
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
      bannerTimer.current = setTimeout(() => {
        setActiveBanner(null)
        onClearBanner?.()
      }, 3500)
    }
  }, [sneakPeekBanner, onClearBanner])

  const isOverlayOpenRef = useRef(isOverlayOpen)
  isOverlayOpenRef.current = isOverlayOpen

  const handleControlCenterOpen = useCallback(() => {
    isOverlayOpenRef.current = true
    onControlCenterOpen()
  }, [onControlCenterOpen])

  const handleClipboardOpen = useCallback(() => {
    isOverlayOpenRef.current = true
    onClipboardOpen()
  }, [onClipboardOpen])

  const handleSettingsOpen = useCallback(() => {
    onSettingsOpen()
  }, [onSettingsOpen])

  const expandNotch = useCallback(() => {
    setExpanded(true)
    if (isElectron) {
      setTimeout(() => {
        window.electronAPI.expandWindow('expanded', {
          expandedWidth: settings.expandedWidth,
          collapsedWidth: settings.collapsedWidth,
        })
      }, 16)
    }
  }, [settings.collapsedWidth, settings.expandedWidth])

  const collapseNotch = useCallback(() => {
    if (isOverlayOpenRef.current || hoveringRef.current) return
    setExpanded(false)
    if (isElectron) {
      setTimeout(() => {
        if (isOverlayOpenRef.current || hoveringRef.current) return
        window.electronAPI.expandWindow('merged', {
          collapsedWidth: settings.collapsedWidth,
        })
      }, 16)
    }
  }, [settings.collapsedWidth])

  const handleMouseEnter = useCallback(() => {
    hoveringRef.current = true
    setHovered(true)
    
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }

    if (expanded || isOverlayOpenRef.current) return

    if (isElectron) {
      window.electronAPI.expandWindow('collapsed', {
        collapsedWidth: settings.collapsedWidth,
      })
    }

    if (expandTimer.current) clearTimeout(expandTimer.current)
    // Fast 80ms hover expansion for smooth responsiveness
    expandTimer.current = setTimeout(expandNotch, 80)
  }, [expanded, expandNotch, settings.collapsedWidth])

  const handleMouseLeave = useCallback(() => {
    hoveringRef.current = false
    setHovered(false)
    if (isOverlayOpenRef.current) return
    
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    collapseTimer.current = setTimeout(collapseNotch, 500) // give time to re-enter
  }, [collapseNotch])

  const handleClick = useCallback((event) => {
    if (expanded || isOverlayOpenRef.current) return
    if (event.target.closest('button,input,select,a')) return
    if (expandTimer.current) clearTimeout(expandTimer.current)
    expandNotch()
  }, [expanded, expandNotch])


  useEffect(() => {
    if (isOverlayOpen) {
      wasOverlayOpenRef.current = true
      setExpanded(true)
      if (collapseTimer.current) {
        clearTimeout(collapseTimer.current)
        collapseTimer.current = null
      }
      if (expandTimer.current) {
        clearTimeout(expandTimer.current)
        expandTimer.current = null
      }
      if (isElectron) {
        window.electronAPI.expandWindow('expanded', {
          expandedWidth: settings.expandedWidth,
          collapsedWidth: settings.collapsedWidth,
        })
      }
      return
    }

    if (wasOverlayOpenRef.current) {
      wasOverlayOpenRef.current = false
      if (!hoveringRef.current) {
        if (collapseTimer.current) clearTimeout(collapseTimer.current)
        collapseTimer.current = setTimeout(collapseNotch, 220)
      }
    }
  }, [isOverlayOpen, settings.expandedWidth, settings.collapsedWidth, collapseNotch])

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      if (expandTimer.current) clearTimeout(expandTimer.current)
    }
  }, [])

  return (
    <div className="notch-wrapper">
      <div
        className={`notch-trigger-area ${expanded ? 'expanded' : (hovered ? 'collapsed' : 'merged')}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={[
            'notch-bar',
            expanded ? 'expanded' : (hovered ? 'collapsed' : 'merged'),
            settings.glowEffect === false ? 'no-glow' : '',
            settings.enableWindowShadow === false ? 'no-shadow' : '',
            settings.transparencyEffects === false ? 'solid' : '',
          ].filter(Boolean).join(' ')}
          onClick={handleClick}
        >
          {/* Drag region */}
          <div className="notch-drag" />

          {/* ── SNEAK PEEK BANNER ── */}
          {activeBanner && (
            <div className="notch-sneak-banner" style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(16px)',
              borderRadius: 'inherit',
              animation: 'bannerSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {activeBanner.albumArt
                    ? <img src={activeBanner.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 14 }}>🎵</span>
                  }
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {activeBanner.title}
                  </span>
                  {activeBanner.artist && (
                    <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {activeBanner.artist}
                    </span>
                  )}
                </div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 10,
                background: 'rgba(124, 106, 247, 0.25)', color: '#a78bfa', letterSpacing: '0.5px', textTransform: 'uppercase', flexShrink: 0
              }}>
                {activeBanner.source || 'NOW PLAYING'}
              </span>
            </div>
          )}

          {/* ── COLLAPSED VIEW ── */}
          <div className="notch-collapsed-view" aria-hidden={expanded}>
            <div className="ncv-left">
              <div className="mini-album-art">
                {safeMedia.albumArt
                  ? <img src={safeMedia.albumArt} alt={safeMedia.album} />
                  : <span className="mini-album-emoji">♪</span>
                }
              </div>
              <AudioVizMini isPlaying={safeMedia.isPlaying} />
              <div className="mini-track-name">
                <span className={miniTitle.length > 16 ? 'scroll-text' : ''}>
                  {miniTitle}
                </span>
              </div>
              {/* Mini source pill */}
              {safeMedia.source && (
                <span className="mini-source-pill">{safeMedia.source}</span>
              )}
            </div>
            <div className="ncv-right">
              <Clock mini settings={settings} />
              {settings.showBattery !== false && <BatteryMini battery={battery} settings={settings} />}
            </div>
          </div>

          {/* ── EXPANDED VIEW ── */}
          <div className="notch-expanded-view" aria-hidden={!expanded}>
            {/* LEFT: Music player with Spotify connector */}
            <div className="notch-left-panel">
              {/* Source connector bar */}
              {settings.showSource !== false && safeMedia.source && (
                <SourceConnector source={safeMedia.source} />
              )}
              <MusicPlayer
                media={safeMedia}
                settings={settings}
                onPlayPause={onPlayPause}
                onNext={onNext}
                onPrev={onPrev}
                onVolumeChange={onVolumeChange}
                onSeek={onSeek}
              />
            </div>

            <div className="notch-divider" role="separator" />

            {/* RIGHT: Clock, battery, system monitor, calendar, connectors */}
            <div className="notch-right-panel">
              <div className="nrp-top">
                <Clock settings={settings} />
                <div className="nrp-actions">
                  {/* Control Center button */}
                  {settings.controlCenterEnabled !== false && (
                    <button
                      id="btn-cc"
                      className="connector-btn"
                      onClick={handleControlCenterOpen}
                      aria-label="Open control center"
                      title="Control Center"
                    >
                      <ControlsIcon />
                    </button>
                  )}
                  {/* Clipboard dock button */}
                  {settings.clipboardEnabled !== false && (
                    <button
                      id="btn-clipboard"
                      className="connector-btn"
                      onClick={handleClipboardOpen}
                      aria-label="Open clipboard"
                      title="Clipboard"
                    >
                      <ClipIcon />
                    </button>
                  )}
                  {/* Sync Bridge button */}
                  {settings.syncBridgeEnabled !== false && (
                    <button
                      id="btn-sync-bridge"
                      className="connector-btn"
                      onClick={() => {
                        isOverlayOpenRef.current = true
                        onSyncBridgeOpen?.()
                      }}
                      aria-label="Open Sync Bridge"
                      title="Notch Sync Bridge"
                      style={{ fontSize: '12px' }}
                    >
                      🔗
                    </button>
                  )}
                  <button
                    id="btn-settings"
                    className="gear-btn"
                    onClick={handleSettingsOpen}
                    aria-label="Open settings"
                    title="Settings"
                  >
                    <GearIcon />
                  </button>
                </div>
              </div>

              {settings.showSystemMonitor !== false && (
                <SystemMonitor settings={settings} />
              )}

              {settings.showBattery !== false && (
                <BatteryIndicator battery={battery} settings={settings} />
              )}

              {settings.calendarConnector !== false && settings.showCalendar !== false && (
                <div className="calendar-connector">
                  <div className="cal-connector-header">
                    <span className="cal-connector-icon">📅</span>
                    <span className="cal-connector-label">Calendar</span>
                  </div>
                  <CalendarMini settings={settings} />
                </div>
              )}


            </div>
          </div>

          {/* Ambient bottom indicator */}
          <div className="notch-indicator" />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function AudioVizMini({ isPlaying }) {
  return (
    <div className={`viz-mini ${isPlaying ? 'playing' : 'paused'}`} aria-hidden="true">
      <div className="vm-bar" />
      <div className="vm-bar" />
      <div className="vm-bar" />
      <div className="vm-bar" />
    </div>
  )
}

function BatteryMini({ battery }) {
  const { level = 100, charging = false, available = false, acConnected = false } = battery || {}
  if (!available) return null
  const colorClass = level > 60 ? 'high' : level > 20 ? 'mid' : 'low'
  const isPluggedIn = charging || acConnected
  return (
    <div className="battery-mini" title={`${level}%${charging ? ' · Charging' : acConnected ? ' · Plugged In' : ''}`}>
      {isPluggedIn && <span className="bolt">⚡</span>}
      <div className="bm-icon">
        <div
          className={`bm-fill ${colorClass}`}
          style={{ width: `${level}%` }}
        />
      </div>
      <span className="bm-pct">{level}%</span>
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58
        c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96
        c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84
        c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33
        c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58
        C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61
        l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54
        c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54
        c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32
        c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z
        M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
    </svg>
  )
}

function ClipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
    </svg>
  )
}

function ControlsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h6V7h-6V5h-2v6h2V9z"/>
    </svg>
  )
}
