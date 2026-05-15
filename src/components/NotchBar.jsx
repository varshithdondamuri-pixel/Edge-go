import { useState, useEffect, useRef, useCallback } from 'react'
import MusicPlayer from './MusicPlayer.jsx'
import Clock from './Clock.jsx'
import BatteryIndicator from './BatteryIndicator.jsx'
import CalendarMini from './CalendarMini.jsx'

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
  media, battery,
  onPlayPause, onNext, onPrev,
  onVolumeChange, onSeek,
  onSettingsOpen,
  onClipboardOpen,
  onControlCenterOpen,
}) {
  const [expanded, setExpanded] = useState(false)
  const collapseTimer = useRef(null)
  const expandTimer = useRef(null)

  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    expandTimer.current = setTimeout(() => {
      setExpanded(true)
      if (isElectron) window.electronAPI.expandWindow(true)
    }, 80)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (expandTimer.current) clearTimeout(expandTimer.current)
    collapseTimer.current = setTimeout(() => {
      setExpanded(false)
      if (isElectron) window.electronAPI.expandWindow(false)
    }, 400)
  }, [])

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      if (expandTimer.current) clearTimeout(expandTimer.current)
    }
  }, [])

  return (
    <div className="notch-wrapper">
      <div
        className={`notch-bar ${expanded ? 'expanded' : 'collapsed'}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Drag region */}
        <div className="notch-drag" />

        {/* ── COLLAPSED VIEW ── */}
        <div className="notch-collapsed-view" aria-hidden={expanded}>
          <div className="ncv-left">
            <div className="mini-album-art">
              {media.albumArt
                ? <img src={media.albumArt} alt={media.album} />
                : <span className="mini-album-emoji">♪</span>
              }
            </div>
            <AudioVizMini isPlaying={media.isPlaying} />
            <div className="mini-track-name">
              <span className={media.title.length > 16 ? 'scroll-text' : ''}>
                {media.title}
              </span>
            </div>
            {/* Mini source pill */}
            {media.source && (
              <span className="mini-source-pill">{media.source}</span>
            )}
          </div>
          <div className="ncv-right">
            <Clock mini />
            <BatteryMini battery={battery} />
          </div>
        </div>

        {/* ── EXPANDED VIEW ── */}
        <div className="notch-expanded-view" aria-hidden={!expanded}>
          {/* LEFT: Music player with Spotify connector */}
          <div className="notch-left-panel">
            {/* Source connector bar */}
            {media.source && (
              <SourceConnector source={media.source} />
            )}
            <MusicPlayer
              media={media}
              onPlayPause={onPlayPause}
              onNext={onNext}
              onPrev={onPrev}
              onVolumeChange={onVolumeChange}
              onSeek={onSeek}
            />
          </div>

          <div className="notch-divider" role="separator" />

          {/* RIGHT: Clock, battery, calendar, connectors */}
          <div className="notch-right-panel">
            <div className="nrp-top">
              <Clock />
              <div className="nrp-actions">
                {/* Clipboard dock button */}
                <button
                  id="btn-clipboard"
                  className="connector-btn"
                  onClick={onClipboardOpen}
                  aria-label="Open clipboard"
                  title="Clipboard"
                >
                  <ClipIcon />
                </button>
                <button
                  id="btn-settings"
                  className="gear-btn"
                  onClick={onSettingsOpen}
                  aria-label="Open settings"
                  title="Settings"
                >
                  <GearIcon />
                </button>
              </div>
            </div>

            <BatteryIndicator battery={battery} />

            {/* Calendar connector */}
            <div className="calendar-connector">
              <div className="cal-connector-header">
                <span className="cal-connector-icon">📅</span>
                <span className="cal-connector-label">Calendar</span>
              </div>
              <CalendarMini />
            </div>

            {/* Connector pills row */}
            <div className="connector-pills">
              <ConnectorPill icon="🎛️" label="Controls" onClick={onControlCenterOpen} id="pill-cc" />
              <ConnectorPill icon="📋" label="Clipboard" onClick={onClipboardOpen} id="pill-clipboard" />
              <ConnectorPill icon="⚙️" label="Settings" onClick={onSettingsOpen} id="pill-settings" />
            </div>
          </div>
        </div>

        {/* Ambient bottom indicator */}
        <div className="notch-indicator" />
      </div>
    </div>
  )
}

// ── Connector pill ────────────────────────────────────────────────────────────
function ConnectorPill({ icon, label, onClick, id }) {
  return (
    <button id={id} className="conn-pill" onClick={onClick} title={label}>
      <span className="conn-pill-icon">{icon}</span>
      <span className="conn-pill-label">{label}</span>
    </button>
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
  const { level, charging } = battery
  const colorClass = level > 60 ? 'high' : level > 20 ? 'mid' : 'low'
  return (
    <div className="battery-mini" title={`${level}%${charging ? ' · Charging' : ''}`}>
      {charging && <span className="bolt">⚡</span>}
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
