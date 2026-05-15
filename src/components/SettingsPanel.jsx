import { useState, useEffect, useRef } from 'react'

// ─── Sidebar nav ─────────────────────────────────────────────────────────────
const NAV = [
  { id: 'general',     icon: '⚙️',  label: 'General' },
  { id: 'appearance',  icon: '🎨',  label: 'Appearance' },
  { id: 'media',       icon: '🎵',  label: 'Media' },
  { id: 'calendar',    icon: '📅',  label: 'Calendar' },
  { id: 'huds',        icon: '🪟',  label: 'HUDs' },
  { id: 'battery',     icon: '🔋',  label: 'Battery' },
  { id: 'connectors',  icon: '🔗',  label: 'Connectors' },
  { id: 'shortcuts',   icon: '⌨️',  label: 'Shortcuts' },
  { id: 'advanced',    icon: '🧪',  label: 'Advanced' },
  { id: 'about',       icon: 'ℹ️',  label: 'About' },
]

const DEFAULT_SETTINGS = {
  // General
  launchAtStartup: false,
  alwaysOnTop: true,
  showInTaskbar: false,
  notchPosition: 'center',
  use24h: true,
  language: 'en',

  // Appearance
  accentColor: '#7c6af7',
  glowEffect: true,
  blurIntensity: 'medium',
  cornerRadius: 20,
  collapsedWidth: 320,
  expandedWidth: 680,
  animationSpeed: 'normal',
  darkMode: true,
  enableWindowShadow: true,

  // Media
  showAlbumArt: true,
  showVisualizer: true,
  showSource: true,
  showProgressBar: true,
  volumeHUDEnabled: true,
  sneakPeek: true,
  mediaPollingInterval: 5,

  // Calendar
  showCalendar: true,
  showDayNames: true,
  weekStartsMonday: false,
  showWeekNumbers: false,

  // HUDs
  volumeHUD: true,
  brightnessHUD: true,
  batteryHUD: true,
  hudPosition: 'bottom-center',

  // Battery
  showBattery: true,
  showBatteryPct: true,
  showPowerIcons: true,
  batteryNotifications: true,

  // Connectors
  spotifyEnabled: true,
  youtubeEnabled: true,
  calendarConnector: true,
  clipboardEnabled: true,
  controlCenterEnabled: true,

  // Advanced
  gpuAcceleration: true,
  transparencyEffects: true,
  developerMode: false,
}

// ── Primitive controls ────────────────────────────────────────────────────────

function Toggle({ id, value, onChange }) {
  return (
    <button
      id={id}
      className={`settings-toggle ${value ? 'on' : ''}`}
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
    />
  )
}

function Select({ id, value, onChange, options }) {
  return (
    <select
      id={id}
      className="settings-select"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function Slider({ id, value, onChange, min = 0, max = 100, step = 1, unit = '' }) {
  return (
    <div className="settings-slider-row">
      <input
        id={id}
        type="range"
        className="settings-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="settings-slider-val">{value}{unit}</span>
    </div>
  )
}

function ColorSwatch({ id, value, onChange }) {
  const ref = useRef()
  return (
    <div className="settings-color-row" onClick={() => ref.current?.click()}>
      <div className="scolor-preview" style={{ background: value }} />
      <span className="scolor-hex">{value}</span>
      <input
        ref={ref} id={id} type="color" value={value}
        onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span className="settings-label">{label}</span>
        {hint && <span className="settings-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      {children}
    </div>
  )
}

// ── Shortcut recorder ─────────────────────────────────────────────────────────
function ShortcutKey({ keys, onClear }) {
  return (
    <div className="shortcut-row">
      <div className="shortcut-keys">
        {keys.map((k, i) => <kbd key={i} className="kbd">{k}</kbd>)}
      </div>
      <button className="shortcut-clear" onClick={onClear} aria-label="Clear shortcut">✕</button>
    </div>
  )
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function GeneralTab({ s, set }) {
  return (
    <>
      <Section title="Startup">
        <Row label="Launch at Startup" hint="Start Edge Go with Windows">
          <Toggle id="tog-startup" value={s.launchAtStartup} onChange={v => {
            set('launchAtStartup', v)
            window.electronAPI?.setLaunchAtStartup?.(v)
          }} />
        </Row>
      </Section>
      <Section title="Window">
        <Row label="Always on Top" hint="Float above other windows">
          <Toggle id="tog-aot" value={s.alwaysOnTop} onChange={v => {
            set('alwaysOnTop', v)
            window.electronAPI?.setAlwaysOnTop?.(v)
          }} />
        </Row>
        <Row label="Show in Taskbar">
          <Toggle id="tog-taskbar" value={s.showInTaskbar} onChange={v => set('showInTaskbar', v)} />
        </Row>
        <Row label="Notch Position">
          <Select id="sel-pos" value={s.notchPosition} onChange={v => set('notchPosition', v)} options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ]} />
        </Row>
      </Section>
      <Section title="Localization">
        <Row label="Clock Format">
          <Select id="sel-clock" value={s.use24h ? '24h' : '12h'} onChange={v => set('use24h', v === '24h')} options={[
            { value: '24h', label: '24-hour' },
            { value: '12h', label: '12-hour (AM/PM)' },
          ]} />
        </Row>
        <Row label="Language">
          <Select id="sel-lang" value={s.language} onChange={v => set('language', v)} options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
            { value: 'fr', label: 'Français' },
            { value: 'de', label: 'Deutsch' },
          ]} />
        </Row>
      </Section>
    </>
  )
}

function AppearanceTab({ s, set }) {
  const PRESETS = ['#7c6af7', '#3b82f6', '#ef4444', '#f97316', '#eab308', '#22c55e', '#ec4899', '#6b7280']
  return (
    <>
      <Section title="Accent Color">
        <Row label="Color" hint="Highlights, buttons & indicators">
          <ColorSwatch id="color-accent" value={s.accentColor} onChange={v => set('accentColor', v)} />
        </Row>
        <div className="accent-presets">
          {PRESETS.map(c => (
            <button
              key={c}
              className={`accent-dot ${s.accentColor === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => set('accentColor', c)}
              aria-label={`Accent color ${c}`}
            />
          ))}
        </div>
      </Section>
      <Section title="Window Appearance">
        <Row label="Dark Mode" hint="Use dark theme colors">
          <Toggle id="tog-dark" value={s.darkMode} onChange={v => set('darkMode', v)} />
        </Row>
        <Row label="Glow Effect" hint="Ambient glow on expand">
          <Toggle id="tog-glow" value={s.glowEffect} onChange={v => set('glowEffect', v)} />
        </Row>
        <Row label="Window Shadow">
          <Toggle id="tog-shadow" value={s.enableWindowShadow} onChange={v => set('enableWindowShadow', v)} />
        </Row>
        <Row label="Corner Radius">
          <Slider id="sl-radius" value={s.cornerRadius} onChange={v => set('cornerRadius', v)} min={8} max={32} step={2} unit="px" />
        </Row>
        <Row label="Backdrop Blur">
          <Select id="sel-blur" value={s.blurIntensity} onChange={v => set('blurIntensity', v)} options={[
            { value: 'low', label: 'Low (12px)' },
            { value: 'medium', label: 'Medium (24px)' },
            { value: 'high', label: 'High (40px)' },
          ]} />
        </Row>
      </Section>
      <Section title="Dimensions">
        <Row label="Collapsed Width">
          <Slider id="sl-cw" value={s.collapsedWidth} onChange={v => set('collapsedWidth', v)} min={240} max={440} step={10} unit="px" />
        </Row>
        <Row label="Expanded Width">
          <Slider id="sl-ew" value={s.expandedWidth} onChange={v => set('expandedWidth', v)} min={500} max={800} step={10} unit="px" />
        </Row>
      </Section>
      <Section title="Animation">
        <Row label="Speed">
          <Select id="sel-anim" value={s.animationSpeed} onChange={v => set('animationSpeed', v)} options={[
            { value: 'slow', label: 'Slow' },
            { value: 'normal', label: 'Normal' },
            { value: 'fast', label: 'Fast' },
            { value: 'off', label: 'Off' },
          ]} />
        </Row>
      </Section>
    </>
  )
}

function MediaTab({ s, set }) {
  return (
    <>
      <Section title="Display">
        <Row label="Album Art"><Toggle id="tog-art" value={s.showAlbumArt} onChange={v => set('showAlbumArt', v)} /></Row>
        <Row label="Audio Visualizer"><Toggle id="tog-viz" value={s.showVisualizer} onChange={v => set('showVisualizer', v)} /></Row>
        <Row label="Progress Bar"><Toggle id="tog-prog" value={s.showProgressBar} onChange={v => set('showProgressBar', v)} /></Row>
        <Row label="Show Source" hint="Spotify, YouTube, etc."><Toggle id="tog-src" value={s.showSource} onChange={v => set('showSource', v)} /></Row>
      </Section>
      <Section title="Sneak Peek">
        <Row label="Enable Sneak Peek" hint="Shows track title briefly on change">
          <Toggle id="tog-sneak" value={s.sneakPeek} onChange={v => set('sneakPeek', v)} />
        </Row>
      </Section>
      <Section title="Polling">
        <Row label="Media Refresh Interval">
          <Select id="sel-poll" value={s.mediaPollingInterval} onChange={v => set('mediaPollingInterval', Number(v))} options={[
            { value: 1, label: '1 second' },
            { value: 2, label: '2 seconds' },
            { value: 5, label: '5 seconds' },
            { value: 10, label: '10 seconds' },
          ]} />
        </Row>
      </Section>
    </>
  )
}

function CalendarTab({ s, set }) {
  return (
    <>
      <Section title="General">
        <Row label="Show Calendar"><Toggle id="tog-cal" value={s.showCalendar} onChange={v => set('showCalendar', v)} /></Row>
        <Row label="Show Day Names" hint="Mo, Tu, We…"><Toggle id="tog-daynames" value={s.showDayNames} onChange={v => set('showDayNames', v)} /></Row>
        <Row label="Show Week Numbers"><Toggle id="tog-weeknum" value={s.showWeekNumbers} onChange={v => set('showWeekNumbers', v)} /></Row>
      </Section>
      <Section title="Week Start">
        <Row label="Starts on Monday">
          <Toggle id="tog-monstart" value={s.weekStartsMonday} onChange={v => set('weekStartsMonday', v)} />
        </Row>
      </Section>
    </>
  )
}

function HUDsTab({ s, set }) {
  return (
    <>
      <Section title="Overlays">
        <Row label="Volume HUD" hint="Pops up on key press"><Toggle id="tog-vhud" value={s.volumeHUD} onChange={v => set('volumeHUD', v)} /></Row>
        <Row label="Brightness HUD"><Toggle id="tog-bhud" value={s.brightnessHUD} onChange={v => set('brightnessHUD', v)} /></Row>
        <Row label="Battery HUD" hint="On charge / disconnect"><Toggle id="tog-bathud" value={s.batteryHUD} onChange={v => set('batteryHUD', v)} /></Row>
      </Section>
      <Section title="Position">
        <Row label="HUD Position">
          <Select id="sel-hudpos" value={s.hudPosition} onChange={v => set('hudPosition', v)} options={[
            { value: 'bottom-center', label: 'Bottom Center' },
            { value: 'bottom-left', label: 'Bottom Left' },
            { value: 'bottom-right', label: 'Bottom Right' },
            { value: 'top-center', label: 'Top Center' },
          ]} />
        </Row>
      </Section>
    </>
  )
}

function BatteryTab({ s, set }) {
  return (
    <>
      <Section title="General">
        <Row label="Show Battery Indicator"><Toggle id="tog-batshow" value={s.showBattery} onChange={v => set('showBattery', v)} /></Row>
        <Row label="Show Power Status Notifications"><Toggle id="tog-batnoti" value={s.batteryNotifications} onChange={v => set('batteryNotifications', v)} /></Row>
      </Section>
      <Section title="Battery Information">
        <Row label="Show Battery Percentage"><Toggle id="tog-batpct" value={s.showBatteryPct} onChange={v => set('showBatteryPct', v)} /></Row>
        <Row label="Show Power Status Icons"><Toggle id="tog-baticons" value={s.showPowerIcons} onChange={v => set('showPowerIcons', v)} /></Row>
      </Section>
    </>
  )
}

function ConnectorsTab({ s, set }) {
  return (
    <>
      <Section title="Media Connectors">
        <Row label="Apple Music" hint="Now Playing connector">
          <Toggle id="tog-applemusic" value={s.spotifyEnabled} onChange={v => set('spotifyEnabled', v)} />
        </Row>
        <Row label="Browser Media" hint="Chrome/Edge/Safari connector">
          <Toggle id="tog-browser" value={s.browserEnabled} onChange={v => set('browserEnabled', v)} />
        </Row>
      </Section>
      <Section title="Dock Connectors">
        <Row label="Calendar Connector">
          <Toggle id="tog-calcn" value={s.calendarConnector} onChange={v => set('calendarConnector', v)} />
        </Row>
        <Row label="Clipboard History">
          <Toggle id="tog-clip" value={s.clipboardEnabled} onChange={v => set('clipboardEnabled', v)} />
        </Row>
        <Row label="Control Center">
          <Toggle id="tog-cc" value={s.controlCenterEnabled} onChange={v => set('controlCenterEnabled', v)} />
        </Row>
      </Section>
    </>
  )
}

function ShortcutsTab() {
  const [shortcuts, setShortcuts] = useState({
    sneakPeek:   ['⇧', '⌘', 'H'],
    toggleNotch: ['⇧', '⌘', 'I'],
    controlCenter: ['⇧', '⌘', 'C'],
    clipboard:   ['⇧', '⌘', 'V'],
  })
  const clear = (key) => setShortcuts(s => ({ ...s, [key]: [] }))
  return (
    <>
      <Section title="Media">
        <Row label="Toggle Sneak Peek" hint="Show track title for a moment">
          {shortcuts.sneakPeek.length > 0
            ? <ShortcutKey keys={shortcuts.sneakPeek} onClear={() => clear('sneakPeek')} />
            : <button className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, sneakPeek: ['⇧','⌘','H'] }))}>Record</button>
          }
        </Row>
        <Row label="Toggle Notch Open">
          {shortcuts.toggleNotch.length > 0
            ? <ShortcutKey keys={shortcuts.toggleNotch} onClear={() => clear('toggleNotch')} />
            : <button className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, toggleNotch: ['⇧','⌘','I'] }))}>Record</button>
          }
        </Row>
      </Section>
      <Section title="Panels">
        <Row label="Open Control Center">
          {shortcuts.controlCenter.length > 0
            ? <ShortcutKey keys={shortcuts.controlCenter} onClear={() => clear('controlCenter')} />
            : <button className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, controlCenter: ['⇧','⌘','C'] }))}>Record</button>
          }
        </Row>
        <Row label="Open Clipboard">
          {shortcuts.clipboard.length > 0
            ? <ShortcutKey keys={shortcuts.clipboard} onClear={() => clear('clipboard')} />
            : <button className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, clipboard: ['⇧','⌘','V'] }))}>Record</button>
          }
        </Row>
      </Section>
    </>
  )
}

function AdvancedTab({ s, set }) {
  return (
    <>
      <Section title="Accent Color">
        <Row label="Pick a Color" hint="Choose any color">
          <ColorSwatch id="adv-color-accent" value={s.accentColor} onChange={v => set('accentColor', v)} />
        </Row>
      </Section>
      <Section title="Window Appearance">
        <Row label="Enable Window Shadow">
          <Toggle id="tog-winshadow" value={s.enableWindowShadow} onChange={v => set('enableWindowShadow', v)} />
        </Row>
        <Row label="Corner Radius Scaling">
          <Toggle id="tog-radius" value={s.cornerRadius > 16} onChange={v => set('cornerRadius', v ? 24 : 12)} />
        </Row>
      </Section>
      <Section title="Performance">
        <Row label="GPU Acceleration" hint="Hardware-accelerated rendering">
          <Toggle id="tog-gpu" value={s.gpuAcceleration} onChange={v => set('gpuAcceleration', v)} />
        </Row>
        <Row label="Transparency Effects" hint="Blur behind the notch">
          <Toggle id="tog-trans" value={s.transparencyEffects} onChange={v => set('transparencyEffects', v)} />
        </Row>
      </Section>
      <Section title="Developer">
        <Row label="Developer Mode" hint="Enable debug tools">
          <Toggle id="tog-dev" value={s.developerMode} onChange={v => {
            set('developerMode', v)
            if (v && window.electronAPI?.openDevTools) window.electronAPI.openDevTools()
          }} />
        </Row>
        <button
          id="btn-reset-settings"
          className="settings-danger-btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            if (window.confirm('Reset all settings to defaults?')) {
              localStorage.removeItem('edge-go-settings')
              window.location.reload()
            }
          }}
        >
          Reset All Settings
        </button>
      </Section>
    </>
  )
}

function AboutTab() {
  return (
    <>
      <div className="about-hero">
        <div className="about-logo">✦</div>
        <div className="about-name">Edge Go</div>
        <div className="about-version">v1.0.0</div>
      </div>
      <div className="about-tagline">
        A sleek, always-on-top floating HUD bar<br />built seamlessly for Windows.
      </div>
      <Section title="Version info">
        <Row label="Release name"><span className="settings-label" style={{ color: 'var(--color-text-secondary)' }}>Flying Rabbit 🐇</span></Row>
        <Row label="Version"><span className="settings-label" style={{ color: 'var(--color-text-secondary)' }}>1.0.0</span></Row>
      </Section>
      <Section title="Software updates">
        <Row label="Automatically check for updates"><Toggle id="tog-autoupdate" value={true} onChange={() => {}} /></Row>
        <Row label="Automatically download updates"><Toggle id="tog-autodown" value={true} onChange={() => {}} /></Row>
      </Section>
      <div className="about-links">
        <a id="link-github" href="https://github.com" target="_blank" rel="noreferrer" className="about-link">
          <span>⭐</span> GitHub
        </a>
        <a id="link-bug" href="https://github.com/issues" target="_blank" rel="noreferrer" className="about-link">
          <span>🐛</span> Report Bug
        </a>
      </div>
      <div className="about-upgrade">
        <div className="upgrade-badge">✦ Pro</div>
        <div className="upgrade-text">
          <strong>Unlock Pro Features</strong>
          <span>Custom themes, more widgets, priority support</span>
        </div>
        <button id="btn-upgrade" className="upgrade-btn" onClick={() => alert('Pro version coming soon!')}>
          Upgrade →
        </button>
      </div>
      <div className="about-footer">Made with ♥ by not so boring people</div>
    </>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function SettingsPanel({ open, onClose, initialTab, isStandalone, settings: propSettings, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'general')
  const [localSettings, setLocalSettings] = useState(() => {
    if (propSettings) return propSettings
    try {
      const saved = localStorage.getItem('edge-go-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  // Use effective settings (prop if provided, else local)
  const settings = propSettings || localSettings

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (!propSettings) {
      localStorage.setItem('edge-go-settings', JSON.stringify(settings))
    }
    if (window.electronAPI?.updateSettings) {
      window.electronAPI.updateSettings(settings)
    }
  }, [settings, propSettings])

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

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const set = (key, value) => {
    if (onSettingsChange) {
      onSettingsChange(s => ({ ...s, [key]: value }))
    } else {
      setLocalSettings(s => ({ ...s, [key]: value }))
    }
  }

  if (!open) return null

  const PANELS = {
    general:    <GeneralTab s={settings} set={set} />,
    appearance: <AppearanceTab s={settings} set={set} />,
    media:      <MediaTab s={settings} set={set} />,
    calendar:   <CalendarTab s={settings} set={set} />,
    huds:       <HUDsTab s={settings} set={set} />,
    battery:    <BatteryTab s={settings} set={set} />,
    connectors: <ConnectorsTab s={settings} set={set} />,
    shortcuts:  <ShortcutsTab />,
    advanced:   <AdvancedTab s={settings} set={set} />,
    about:      <AboutTab />,
  }

  return (
    <>
      {!isStandalone && <div id="settings-backdrop" className="settings-backdrop" onClick={onClose} aria-hidden="true" />}
      <div
        id="settings-panel"
        className={`settings-panel settings-panel-v2 ${isStandalone ? 'standalone' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* ── Sidebar ── */}
        <nav className="sp-sidebar" aria-label="Settings sections">
          <div className="sp-sidebar-header" style={isStandalone ? { WebkitAppRegion: 'drag' } : {}}>
            <span className="sp-sidebar-logo">✦</span>
            <span className="sp-sidebar-appname">Edge Go</span>
          </div>
          <ul className="sp-nav-list" role="list">
            {NAV.map(item => (
              <li key={item.id} style={isStandalone ? { WebkitAppRegion: 'no-drag' } : {}}>
                <button
                  id={`sp-nav-${item.id}`}
                  className={`sp-nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                  role="tab"
                  aria-selected={activeTab === item.id}
                >
                  <span className="sp-nav-icon">{item.icon}</span>
                  <span className="sp-nav-label">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Content area ── */}
        <div className="sp-content">
          <div className="sp-content-header" style={isStandalone ? { WebkitAppRegion: 'drag' } : {}}>
            <div className="sp-content-title">
              <span className="sp-content-icon">{NAV.find(n => n.id === activeTab)?.icon}</span>
              {NAV.find(n => n.id === activeTab)?.label}
            </div>
            <button id="btn-close-settings" className="settings-close" onClick={onClose} aria-label="Close settings" style={isStandalone ? { WebkitAppRegion: 'no-drag' } : {}}>✕</button>
          </div>
          <div className="sp-content-body settings-body" style={isStandalone ? { WebkitAppRegion: 'no-drag' } : {}}>
            {PANELS[activeTab]}
          </div>
        </div>
      </div>
    </>
  )
}
