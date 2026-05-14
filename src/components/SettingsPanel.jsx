import { useState, useEffect, useRef } from 'react'

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: '🎨' },
  { id: 'media',      label: 'Media',      icon: '🎵' },
  { id: 'system',     label: 'System',     icon: '⚙️' },
  { id: 'about',      label: 'About',      icon: 'ℹ️' },
]

const DEFAULT_SETTINGS = {
  // Appearance
  accentColor: '#7c6af7',
  glowEffect: true,
  blurIntensity: 'medium',
  collapsedWidth: 320,
  expandedWidth: 660,
  showClock: true,
  showBattery: true,
  showCalendar: true,
  animationSpeed: 'normal',

  // Media
  showAlbumArt: true,
  showVisualizer: true,
  showSource: true,
  showProgressBar: true,
  volumeHUDEnabled: true,
  mediaPollingInterval: 5,

  // System
  launchAtStartup: false,
  alwaysOnTop: true,
  showInTaskbar: false,
  notchPosition: 'center',
  use24h: true,
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
      onKeyDown={e => e.key === 'Enter' && onChange(!value)}
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
        ref={ref}
        id={id}
        type="color"
        value={value}
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

// ── Tab panels ────────────────────────────────────────────────────────────────

function AppearanceTab({ s, set }) {
  return (
    <>
      <Section title="Colors">
        <Row label="Accent Color" hint="Highlights, buttons & indicators">
          <ColorSwatch id="color-accent" value={s.accentColor} onChange={v => set('accentColor', v)} />
        </Row>
        <Row label="Glow Effect" hint="Ambient glow on expand">
          <Toggle id="toggle-glow" value={s.glowEffect} onChange={v => set('glowEffect', v)} />
        </Row>
        <Row label="Backdrop Blur">
          <Select
            id="sel-blur"
            value={s.blurIntensity}
            onChange={v => set('blurIntensity', v)}
            options={[
              { value: 'low', label: 'Low (12px)' },
              { value: 'medium', label: 'Medium (24px)' },
              { value: 'high', label: 'High (40px)' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Dimensions">
        <Row label="Collapsed Width" hint={`${s.collapsedWidth}px`}>
          <Slider id="slider-cw" value={s.collapsedWidth} onChange={v => set('collapsedWidth', v)}
            min={240} max={440} step={10} unit="px" />
        </Row>
        <Row label="Expanded Width" hint={`${s.expandedWidth}px`}>
          <Slider id="slider-ew" value={s.expandedWidth} onChange={v => set('expandedWidth', v)}
            min={500} max={800} step={10} unit="px" />
        </Row>
      </Section>

      <Section title="Widgets">
        <Row label="Show Clock">
          <Toggle id="toggle-clock" value={s.showClock} onChange={v => set('showClock', v)} />
        </Row>
        <Row label="Show Battery">
          <Toggle id="toggle-battery" value={s.showBattery} onChange={v => set('showBattery', v)} />
        </Row>
        <Row label="Show Calendar">
          <Toggle id="toggle-cal" value={s.showCalendar} onChange={v => set('showCalendar', v)} />
        </Row>
      </Section>

      <Section title="Animation">
        <Row label="Animation Speed">
          <Select
            id="sel-anim"
            value={s.animationSpeed}
            onChange={v => set('animationSpeed', v)}
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Row>
      </Section>
    </>
  )
}

function MediaTab({ s, set }) {
  return (
    <>
      <Section title="Display">
        <Row label="Album Art">
          <Toggle id="toggle-art" value={s.showAlbumArt} onChange={v => set('showAlbumArt', v)} />
        </Row>
        <Row label="Audio Visualizer">
          <Toggle id="toggle-viz" value={s.showVisualizer} onChange={v => set('showVisualizer', v)} />
        </Row>
        <Row label="Progress Bar">
          <Toggle id="toggle-prog" value={s.showProgressBar} onChange={v => set('showProgressBar', v)} />
        </Row>
        <Row label="Show Source" hint="Spotify, YouTube, etc.">
          <Toggle id="toggle-src" value={s.showSource} onChange={v => set('showSource', v)} />
        </Row>
      </Section>

      <Section title="Volume HUD">
        <Row label="Volume Overlay" hint="Pops up on key press">
          <Toggle id="toggle-vhud" value={s.volumeHUDEnabled} onChange={v => set('volumeHUDEnabled', v)} />
        </Row>
      </Section>

      <Section title="Polling">
        <Row label="Media Refresh">
          <Select
            id="sel-poll"
            value={s.mediaPollingInterval}
            onChange={v => set('mediaPollingInterval', Number(v))}
            options={[
              { value: 1, label: '1 second' },
              { value: 2, label: '2 seconds' },
              { value: 5, label: '5 seconds' },
              { value: 10, label: '10 seconds' },
            ]}
          />
        </Row>
      </Section>
    </>
  )
}

function SystemTab({ s, set }) {
  return (
    <>
      <Section title="Startup">
        <Row label="Launch at Startup" hint="Start with Windows">
          <Toggle id="toggle-startup" value={s.launchAtStartup} onChange={v => {
            set('launchAtStartup', v)
            if (window.electronAPI?.setLaunchAtStartup) window.electronAPI.setLaunchAtStartup(v)
          }} />
        </Row>
      </Section>

      <Section title="Window">
        <Row label="Always on Top">
          <Toggle id="toggle-aot" value={s.alwaysOnTop} onChange={v => {
            set('alwaysOnTop', v)
            if (window.electronAPI?.setAlwaysOnTop) window.electronAPI.setAlwaysOnTop(v)
          }} />
        </Row>
        <Row label="Show in Taskbar">
          <Toggle id="toggle-taskbar" value={s.showInTaskbar} onChange={v => set('showInTaskbar', v)} />
        </Row>
        <Row label="Edge Go Position">
          <Select
            id="sel-pos"
            value={s.notchPosition}
            onChange={v => set('notchPosition', v)}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Row>
        <Row label="Clock Format">
          <Select
            id="sel-clock"
            value={s.use24h ? '24h' : '12h'}
            onChange={v => set('use24h', v === '24h')}
            options={[
              { value: '24h', label: '24-hour' },
              { value: '12h', label: '12-hour (AM/PM)' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Danger Zone">
        <button
          id="btn-reset-settings"
          className="settings-danger-btn"
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

      <div className="about-links">
        <a
          id="link-github"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="about-link"
        >
          <span>⭐</span> GitHub
        </a>
        <a
          id="link-bug"
          href="https://github.com/issues"
          target="_blank"
          rel="noreferrer"
          className="about-link"
        >
          <span>🐛</span> Report Bug
        </a>
      </div>

      <div className="about-credits">
        <div className="about-credits-title">Built With</div>
        <div className="about-credits-text">
          Electron 31 · React 18 · Vite 5
        </div>
      </div>

      <div className="about-upgrade">
        <div className="upgrade-badge">✦ Pro</div>
        <div className="upgrade-text">
          <strong>Unlock Pro Features</strong>
          <span>Custom themes, more widgets, priority support</span>
        </div>
        <button
          id="btn-upgrade"
          className="upgrade-btn"
          onClick={() => alert('Pro version coming soon!')}
        >
          Upgrade →
        </button>
      </div>
    </>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function SettingsPanel({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('appearance')
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('edge-go-settings')
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  // Persist whenever settings change
  useEffect(() => {
    localStorage.setItem('edge-go-settings', JSON.stringify(settings))
  }, [settings])

  // Apply accent color live via CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--color-accent', settings.accentColor)
    // Derive glow from accent
    const hex = settings.accentColor
    document.documentElement.style.setProperty('--color-accent-glow', hex + '59')
  }, [settings.accentColor])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const set = (key, value) => setSettings(s => ({ ...s, [key]: value }))

  if (!open) return null

  return (
    <>
      <div
        id="settings-backdrop"
        className="settings-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="settings-panel"
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button
            id="btn-close-settings"
            className="settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="settings-tabs" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div
          id={`tabpanel-${activeTab}`}
          className="settings-body"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'appearance' && <AppearanceTab s={settings} set={set} />}
          {activeTab === 'media'      && <MediaTab s={settings} set={set} />}
          {activeTab === 'system'     && <SystemTab s={settings} set={set} />}
          {activeTab === 'about'      && <AboutTab />}
        </div>
      </div>
    </>
  )
}
