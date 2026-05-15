import { useState, useEffect } from 'react'

// ─── Control tiles config ────────────────────────────────────────────────────

const WIFI_NETWORKS = [
  { id: 'n1', name: 'HomeNetwork_5G', strength: 4, secured: true },
  { id: 'n2', name: 'CoffeeShop_Free', strength: 2, secured: false },
  { id: 'n3', name: 'Office_WiFi', strength: 3, secured: true },
]

export default function ControlCenter({ 
  open, 
  onClose, 
  onOpenSettings, 
  battery = { level: 100, charging: false }, 
  mediaVolume = 50, 
  onVolumeChange,
  allSessions = [],
  onMediaCommand
}) {
  const [wifi, setWifi] = useState(true)
  const [bluetooth, setBluetooth] = useState(true)
  const [dnd, setDnd] = useState(false)
  const [nightLight, setNightLight] = useState(false)
  const [airplanMode, setAirplaneMode] = useState(false)
  const [brightness, setBrightness] = useState(72)
  const [showNetworks, setShowNetworks] = useState(false)
  const [connectedNetwork, setConnectedNetwork] = useState(WIFI_NETWORKS[0])
  const [focusMode, setFocusMode] = useState('off') // off | work | personal | sleep

  // Sync with system state on open
  useEffect(() => {
    if (!open) return;
    
    const syncSystemState = async () => {
      if (window.electronAPI?.getSystemState) {
        try {
          const state = await window.electronAPI.getSystemState();
          setDnd(state.dnd);
          setNightLight(state.nightLight);
          setBrightness(state.brightness);
          if (state.dnd) setFocusMode('work'); // Map DND to work for visual cue
          else setFocusMode('off');
        } catch (e) {
          console.error('Failed to sync system state:', e);
        }
      }
    };

    syncSystemState();
  }, [open]);

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const toggleWifi = () => {
    if (!wifi) setShowNetworks(false)
    setWifi(v => !v)
  }

  const toggleDnd = () => {
    setDnd(v => {
      const next = !v;
      if (window.electronAPI?.setDND) window.electronAPI.setDND(next);
      setFocusMode(next ? 'work' : 'off');
      return next;
    })
  }

  const toggleNightLight = () => {
    setNightLight(v => {
      const next = !v;
      if (window.electronAPI?.setNightLight) window.electronAPI.setNightLight(next);
      return next;
    })
  }

  return (
    <>
      <div className="cc-backdrop" onClick={onClose} />
      <div
        className="cc-panel"
        role="dialog"
        aria-label="Control Center"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="cc-header">
          <span className="cc-title">Control Center</span>
          <div className="cc-header-actions">
            <button className="cc-settings-btn" onClick={() => onOpenSettings?.('general')} aria-label="Settings" title="Open Settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
            <button className="cc-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="cc-body">

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
                    <div className="cc-media-art">
                      {session.source === 'Spotify' ? '🎧' : '🎶'}
                    </div>
                    <div className="cc-media-info">
                      <div className="cc-media-title">{session.title}</div>
                      <div className="cc-media-artist">{session.artist} • {session.source}</div>
                    </div>
                    <div className="cc-media-controls">
                      <button className="cc-media-btn" onClick={() => onMediaCommand('prev', null, session.source)}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6L19 6v12z"/></svg>
                      </button>
                      <button className="cc-media-btn" onClick={() => onMediaCommand('playpause', null, session.source)}>
                        {session.isPlaying ? (
                          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        )}
                      </button>
                      <button className="cc-media-btn" onClick={() => onMediaCommand('next', null, session.source)}>
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Row 1: Network tile group ── */}
          <div className="cc-tile-group cc-network-group">
            {/* Wi-Fi */}
            <div className={`cc-tile cc-tile-wifi ${wifi ? 'active' : ''}`}>
              <div className="cc-tile-inner" onClick={toggleWifi}>
                <div className="cc-tile-icon">
                  <WifiIcon2 active={wifi} />
                </div>
                <div className="cc-tile-info">
                  <div className="cc-tile-name">Wi-Fi</div>
                  <div className="cc-tile-sub">{wifi ? connectedNetwork.name : 'Off'}</div>
                </div>
              </div>
              {wifi && (
                <button
                  className="cc-tile-expand"
                  onClick={(e) => { e.stopPropagation(); setShowNetworks(v => !v) }}
                  aria-label="Show networks"
                  title="Networks"
                >
                  <ChevronIcon />
                </button>
              )}
            </div>

            {/* Bluetooth */}
            <div
              className={`cc-tile cc-tile-half ${bluetooth ? 'active' : ''}`}
              onClick={() => setBluetooth(v => !v)}
            >
              <div className="cc-tile-icon"><BluetoothIcon active={bluetooth} /></div>
              <div className="cc-tile-info">
                <div className="cc-tile-name">Bluetooth</div>
                <div className="cc-tile-sub">{bluetooth ? 'On' : 'Off'}</div>
              </div>
            </div>

            {/* Airplane */}
            <div
              className={`cc-tile cc-tile-half ${airplanMode ? 'active cc-tile-warning' : ''}`}
              onClick={() => setAirplaneMode(v => !v)}
            >
              <div className="cc-tile-icon">✈️</div>
              <div className="cc-tile-info">
                <div className="cc-tile-name">Airplane</div>
                <div className="cc-tile-sub">{airplanMode ? 'On' : 'Off'}</div>
              </div>
            </div>
          </div>

          {/* ── Wi-Fi Networks dropdown ── */}
          {wifi && showNetworks && (
            <div className="cc-network-list" role="listbox" aria-label="Available networks">
              <div className="cc-network-list-title">Available Networks</div>
              {WIFI_NETWORKS.map(net => (
                <div
                  key={net.id}
                  className={`cc-network-item ${connectedNetwork.id === net.id ? 'connected' : ''}`}
                  role="option"
                  aria-selected={connectedNetwork.id === net.id}
                  onClick={() => { setConnectedNetwork(net); setShowNetworks(false) }}
                >
                  <WifiSignal strength={net.strength} />
                  <span className="cc-net-name">{net.name}</span>
                  {net.secured && <span className="cc-net-lock">🔒</span>}
                  {connectedNetwork.id === net.id && <span className="cc-net-check">✓</span>}
                </div>
              ))}
            </div>
          )}

          {/* ── Row 2: Focus / DND ── */}
          <div className="cc-tile-group cc-focus-group">
            <div className="cc-focus-label">Focus Mode</div>
            <div className="cc-focus-pills">
              {[
                { id: 'off',      icon: '🔔', label: 'Off' },
                { id: 'work',     icon: '💼', label: 'Work' },
                { id: 'personal', icon: '🏠', label: 'Personal' },
                { id: 'sleep',    icon: '🌙', label: 'Sleep' },
              ].map(f => (
                <button
                  key={f.id}
                  className={`cc-focus-pill ${focusMode === f.id ? 'active' : ''}`}
                  onClick={() => {
                    setFocusMode(f.id);
                    const isDnd = f.id !== 'off';
                    setDnd(isDnd);
                    if (window.electronAPI?.setDND) window.electronAPI.setDND(isDnd);
                  }}
                  id={`focus-${f.id}`}
                >
                  <span className="cc-focus-pill-icon">{f.icon}</span>
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Row 3: Sliders ── */}
          <div className="cc-sliders">
            {/* Brightness */}
            <div className="cc-slider-row">
              <span className="cc-slider-icon" title="Brightness">
                <BrightnessIcon level={brightness} />
              </span>
              <div className="cc-slider-wrap">
                <input
                  id="cc-brightness"
                  type="range" min={0} max={100}
                  value={brightness}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setBrightness(val);
                    if (window.electronAPI?.setBrightness) window.electronAPI.setBrightness(val);
                  }}
                  className="cc-slider"
                  aria-label="Brightness"
                />
              </div>
              <span className="cc-slider-val">{brightness}%</span>
            </div>

            {/* Volume */}
            <div className="cc-slider-row">
              <span className="cc-slider-icon" title="Volume">
                {mediaVolume === 0 ? '🔇' : mediaVolume < 40 ? '🔈' : '🔊'}
              </span>
              <div className="cc-slider-wrap">
                <input
                  id="cc-volume"
                  type="range" min={0} max={100}
                  value={mediaVolume}
                  onChange={e => onVolumeChange && onVolumeChange(Number(e.target.value))}
                  className="cc-slider"
                  aria-label="Volume"
                />
              </div>
              <span className="cc-slider-val">{mediaVolume}%</span>
            </div>
          </div>

          {/* ── Row 4: Quick toggles ── */}
          <div className="cc-quick-grid">
            <QuickTile
              id="qt-dnd"
              icon={dnd ? '🔕' : '🔔'}
              label="DND"
              active={dnd}
              onClick={toggleDnd}
            />
            <QuickTile
              id="qt-nightlight"
              icon="🌙"
              label="Night Light"
              active={nightLight}
              onClick={toggleNightLight}
            />
            <QuickTile
              id="qt-screenshot"
              icon="📸"
              label="Screenshot"
              active={false}
              onClick={() => {
                if (window.electronAPI?.takeScreenshot) window.electronAPI.takeScreenshot()
              }}
            />
            <QuickTile
              id="qt-clipboard"
              icon="📋"
              label="Clipboard"
              active={false}
              onClick={onClose}
            />
          </div>

          {/* ── Row 5: Battery status ── */}
          <div className="cc-battery-status">
            <div className="cc-batt-left">
              <div className="cc-batt-icon-wrap">
                <div 
                  className="cc-batt-bar" 
                  style={{ 
                    width: `${battery.level}%`, 
                    background: battery.level > 20 ? '#4ade80' : '#f87171' 
                  }} 
                />
              </div>
              <div className="cc-batt-meta">
                <span className="cc-batt-pct">{battery.level}%</span>
                <span className="cc-batt-state">
                  {battery.charging ? 'Charging' : 'Discharging'}
                </span>
              </div>
            </div>
            <div className="cc-batt-history">
              {[65,70,74,73,battery.level].map((v,i) => (
                <div key={i} className="cc-batt-bar-mini" style={{ height: `${v * 0.28}px` }} />
              ))}
            </div>
          </div>

        </div>

        {/* Dock handle */}
        <div className="cc-handle" />
      </div>
    </>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function QuickTile({ id, icon, label, active, onClick }) {
  return (
    <button id={id} className={`qt-tile ${active ? 'active' : ''}`} onClick={onClick}>
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

function BrightnessIcon({ level }) {
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
