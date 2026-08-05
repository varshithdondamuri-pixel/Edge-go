import { useMemo, useState, useEffect, useRef } from 'react'
import {
  applySettingsToDocument,
  DEFAULT_SETTINGS,
  normalizeSettings,
  saveStoredSettings,
} from '../defaultSettings.js'

// ─── Sidebar nav ─────────────────────────────────────────────────────────────
const NAV = [
  { id: 'general',     icon: '⚙️',  label: 'General' },
  { id: 'appearance',  icon: '🎨',  label: 'Appearance' },
  { id: 'media',       icon: '🎵',  label: 'Media' },
  { id: 'calendar',    icon: '📅',  label: 'Calendar' },
  { id: 'huds',        icon: '🪟',  label: 'HUDs' },
  { id: 'battery',     icon: '🔋',  label: 'Battery' },
  { id: 'connectors',  icon: '🔗',  label: 'Connectors' },
  { id: 'agent',       icon: '🤖',  label: 'AI Agent' },
  { id: 'shortcuts',   icon: '⌨️',  label: 'Shortcuts' },
  { id: 'advanced',    icon: '🧪',  label: 'Advanced' },
  { id: 'about',       icon: 'ℹ️',  label: 'About' },
]

// ── Primitive controls ────────────────────────────────────────────────────────

function Toggle({ id, value, onChange, disabled = false }) {
  return (
    <button
      type="button"
      id={id}
      className={`settings-toggle ${value ? 'on' : ''}`}
      role="switch"
      aria-checked={value}
      disabled={disabled}
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

function TextInput({ id, value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      id={id}
      type={type}
      className="settings-text-input"
      value={value || ''}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '8px',
        padding: '6px 12px',
        color: '#fff',
        fontSize: '11px',
        outline: 'none',
        width: '210px',
      }}
    />
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
      <button type="button" className="shortcut-clear" onClick={onClear} aria-label="Clear shortcut">✕</button>
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
        <Row label="Beta Agent Mode" hint="Enable offline AI Agent prompt, pipeline, and settings">
          <Toggle id="tog-beta" value={s.betaModeEnabled} onChange={v => {
            set('betaModeEnabled', v)
            if (v) set('soundEnabled', true)
          }} />
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
      <Section title="Widgets">
        <Row label="System Monitor" hint="CPU & RAM usage in expanded view">
          <Toggle id="tog-sysmon" value={s.showSystemMonitor} onChange={v => set('showSystemMonitor', v)} />
        </Row>
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
      <Section title="Media Apps">
        <Row label="Spotify" hint="Windows SMTC connector">
          <Toggle id="tog-spotify" value={s.spotifyEnabled} onChange={v => set('spotifyEnabled', v)} />
        </Row>
        <Row label="Browser Media" hint="Chrome / Edge / Firefox">
          <Toggle id="tog-browser" value={s.browserEnabled} onChange={v => set('browserEnabled', v)} />
        </Row>
        <Row label="Windows Media Player">
          <Toggle id="tog-wmp" value={s.windowsMediaEnabled} onChange={v => set('windowsMediaEnabled', v)} />
        </Row>
      </Section>
      <Section title="Dock Connectors">
        <Row label="Calendar">
          <Toggle id="tog-calcn" value={s.calendarConnector} onChange={v => set('calendarConnector', v)} />
        </Row>
        <Row label="Clipboard History">
          <Toggle id="tog-clip" value={s.clipboardEnabled} onChange={v => set('clipboardEnabled', v)} />
        </Row>
        <Row label="Control Center">
          <Toggle id="tog-cc" value={s.controlCenterEnabled} onChange={v => set('controlCenterEnabled', v)} />
        </Row>
        <Row label="Sync Bridge">
          <Toggle id="tog-syncbridge" value={s.syncBridgeEnabled} onChange={v => set('syncBridgeEnabled', v)} />
        </Row>
      </Section>
    </>
  )
}

function AgentTab({ s, set }) {
  // Warm up voices cache on mount
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      const handleVoices = () => {
        window.speechSynthesis.getVoices()
      }
      window.speechSynthesis.addEventListener('voiceschanged', handleVoices)
      return () => {
        window.speechSynthesis?.removeEventListener?.('voiceschanged', handleVoices)
      }
    }
  }, [])

  const speakPreview = (profile) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()

    let previewText = `This is a preview of the default voice.`
    if (profile === 'Male') previewText = `This is a preview of the male voice.`
    if (profile === 'Female') previewText = `This is a preview of the female voice.`
    if (profile === 'British') previewText = `This is a preview of the British voice.`
    if (profile === 'Robot') previewText = `This is a preview of the robot voice.`

    const utterance = new SpeechSynthesisUtterance(previewText)
    utterance.volume = 1.0
    
    const voices = window.speechSynthesis.getVoices()
    let selectedVoice = null
    if (profile === 'Male') {
      selectedVoice = voices.find(v => v.name?.toLowerCase().includes('male') || v.name?.toLowerCase().includes('david') || v.name?.toLowerCase().includes('google us english male'))
    } else if (profile === 'Female') {
      selectedVoice = voices.find(v => v.name?.toLowerCase().includes('female') || v.name?.toLowerCase().includes('zira') || v.name?.toLowerCase().includes('google us english female') || v.name?.toLowerCase().includes('samantha'))
    } else if (profile === 'British') {
      selectedVoice = voices.find(v => v.name?.toLowerCase().includes('uk') || v.name?.toLowerCase().includes('british') || v.name?.toLowerCase().includes('hazel') || v.name?.toLowerCase().includes('google uk english'))
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    
    if (profile === 'Robot') {
      utterance.pitch = 0.5
      utterance.rate = 0.85
    } else {
      utterance.pitch = 1.0
      utterance.rate = 1.0
    }

    utterance.onstart = () => {
      window.electronAPI?.setVoiceListenerSuspended?.(true)
    }
    utterance.onend = () => {
      window.electronAPI?.setVoiceListenerSuspended?.(false)
    }
    utterance.onerror = () => {
      window.electronAPI?.setVoiceListenerSuspended?.(false)
    }
    
    window.speechSynthesis.speak(utterance)
  }

  return (
    <>
      <Section title="AI Agent Mode">
        <Row label="Enable Agent Mode" hint="Turn on the offline AI Agent prompt, pipeline, and settings">
          <Toggle id="tog-agent-mode" value={s.betaModeEnabled} onChange={v => {
            set('betaModeEnabled', v)
            if (v) set('soundEnabled', true)
          }} />
        </Row>
      </Section>
      
      {s.betaModeEnabled && (
        <>
          <Section title="Voice & Audio">
            <Row label="Sound Effects" hint="Play voice and chime audio responses">
              <Toggle id="tog-agent-sound" value={s.soundEnabled} onChange={v => set('soundEnabled', v)} />
            </Row>
            <Row label="Voice Profile" hint="Select preferred synthesized voice accent/gender">
              <Select id="sel-agent-voice" value={s.voiceProfile || 'Default'} onChange={v => {
                set('voiceProfile', v)
                speakPreview(v)
              }} options={[
                { value: 'Default', label: 'Default System' },
                { value: 'Male', label: 'David (Male)' },
                { value: 'Female', label: 'Zira / Samantha (Female)' },
                { value: 'British', label: 'Hazel / British (UK)' },
                { value: 'Robot', label: 'Robot Synth' },
              ]} />
            </Row>
            <Row label="Microphone Source">
              <Select id="sel-agent-mic" value={s.microphoneSource || 'System Default'} onChange={v => set('microphoneSource', v)} options={[
                { value: 'System Default', label: 'System Default Microphone' },
              ]} />
            </Row>
          </Section>

          <Section title="Permissions & System">
            <Row label="Agent Permissions" hint="Allow agent to run local git and terminal commands">
              <Toggle id="tog-agent-perm" value={s.agentPermissionsEnabled} onChange={v => set('agentPermissionsEnabled', v)} />
            </Row>
            <Row label="Integrations" hint="Allow agent to interact with other system connectors">
              <Toggle id="tog-agent-integ" value={s.agentIntegrationsEnabled} onChange={v => set('agentIntegrationsEnabled', v)} />
            </Row>
            <Row label="Show in Dock" hint="Display notch in taskbar icon tray">
              <Toggle id="tog-agent-dock" value={s.showInDock} onChange={v => {
                set('showInDock', v)
                window.electronAPI?.setShowInTaskbar?.(v)
              }} />
            </Row>
            <Row label="Show in Screen Recordings" hint="Allow screen capture tools to record the Notch">
              <Toggle id="tog-agent-rec" value={s.showInScreenRecordings} onChange={v => set('showInScreenRecordings', v)} />
            </Row>
            <Row label="Agent Folder">
              <Select id="sel-agent-folder" value={s.agentFolder || 'Default'} onChange={v => set('agentFolder', v)} options={[
                { value: 'Default', label: 'Default Storage' },
              ]} />
            </Row>
          </Section>

          <Section title="Web Search & Bing API">
            <Row label="Bing Web Search API Key" hint="Microsoft Bing Web Search API v7 key for high-precision live web search">
              <TextInput
                id="input-bing-key"
                type="password"
                placeholder="Enter Bing API key..."
                value={s.bingApiKey || ''}
                onChange={v => set('bingApiKey', v)}
              />
            </Row>
            <Row label="Search Results Limit" hint="Limit max search results per request (default: 10, max: 10)">
              <TextInput
                id="input-bing-limit"
                type="number"
                min={1}
                max={10}
                placeholder="10"
                value={s.bingMaxResults ?? 10}
                onChange={v => {
                  const val = parseInt(v, 10)
                  set('bingMaxResults', isNaN(val) ? 10 : Math.min(10, Math.max(1, val)))
                }}
              />
            </Row>
          </Section>
        </>
      )}
    </>
  )
}

function ShortcutsTab() {
  const [shortcuts, setShortcuts] = useState({
    openSettings:  ['Win', 'Alt', 'S'],
    toggleNotch:   ['Win', 'Alt', 'E'],
    controlCenter: ['Win', 'Alt', 'C'],
    clipboard:     ['Win', 'Alt', 'V'],
  })
  const clear = (key) => setShortcuts(s => ({ ...s, [key]: [] }))
  return (
    <>
      <Section title="App">
        <Row label="Toggle HUD Visibility" hint="Win + Alt + E">
          {shortcuts.toggleNotch.length > 0
            ? <ShortcutKey keys={shortcuts.toggleNotch} onClear={() => clear('toggleNotch')} />
            : <button type="button" className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, toggleNotch: ['Win','Alt','E'] }))}>Restore</button>
          }
        </Row>
        <Row label="Open Settings" hint="Win + Alt + S">
          {shortcuts.openSettings.length > 0
            ? <ShortcutKey keys={shortcuts.openSettings} onClear={() => clear('openSettings')} />
            : <button type="button" className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, openSettings: ['Win','Alt','S'] }))}>Restore</button>
          }
        </Row>
      </Section>
      <Section title="Panels">
        <Row label="Open Control Center">
          {shortcuts.controlCenter.length > 0
            ? <ShortcutKey keys={shortcuts.controlCenter} onClear={() => clear('controlCenter')} />
            : <button type="button" className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, controlCenter: ['Win','Alt','C'] }))}>Restore</button>
          }
        </Row>
        <Row label="Open Clipboard">
          {shortcuts.clipboard.length > 0
            ? <ShortcutKey keys={shortcuts.clipboard} onClear={() => clear('clipboard')} />
            : <button type="button" className="shortcut-record-btn" onClick={() => setShortcuts(s => ({ ...s, clipboard: ['Win','Alt','V'] }))}>Restore</button>
          }
        </Row>
      </Section>
    </>
  )
}

function AdvancedTab({ s, set, onReset }) {
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
          type="button"
          id="btn-reset-settings"
          className="settings-danger-btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            if (window.confirm('Reset all settings to defaults?')) {
              onReset()
            }
          }}
        >
          Reset All Settings
        </button>
      </Section>
    </>
  )
}

function AboutTab({ s, set }) {
  const [appVersion, setAppVersion] = useState('1.6.1')
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (window.electronAPI?.getSystemInfo) {
      window.electronAPI.getSystemInfo().then(info => {
        if (info?.version) setAppVersion(info.version)
      }).catch(() => {})
    }
    if (window.electronAPI?.checkInternet) {
      window.electronAPI.checkInternet().then(status => setOnline(status)).catch(() => {})
    }
  }, [])

  const handleCheckUpdate = async () => {
    if (!window.electronAPI?.checkGitUpdate) return
    setChecking(true)
    try {
      const res = await window.electronAPI.checkGitUpdate()
      setUpdateInfo(res)
      setOnline(res.online)
    } catch (e) {
      setUpdateInfo({ online: false, message: 'Update check failed: ' + e.message })
    } finally {
      setChecking(false)
    }
  }

  const handleApplyUpdate = async () => {
    if (!window.electronAPI?.performGitUpdate) return
    setUpdating(true)
    try {
      const res = await window.electronAPI.performGitUpdate()
      if (res && !res.ok) {
        setUpdateInfo(prev => ({ ...prev, message: 'Update error: ' + (res.error || 'Git pull failed') }))
      }
    } catch (e) {
      setUpdateInfo(prev => ({ ...prev, message: 'Update error: ' + e.message }))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <>
      <div className="about-hero">
        <div className="about-logo">✦</div>
        <div className="about-name">Edge Go</div>
        <div className="about-version">v{appVersion}</div>
      </div>
      <div className="about-tagline">
        A sleek, always-on-top floating HUD bar<br />built exclusively for Windows.
      </div>
      <Section title="Version & Network info">
        <Row label="Release name"><span className="settings-label" style={{ color: 'var(--color-text-secondary)' }}>Windows Edition 🪟</span></Row>
        <Row label="Version"><span className="settings-label" style={{ color: 'var(--color-text-secondary)' }}>{appVersion}</span></Row>
        <Row label="Internet Connection">
          <span className="settings-label" style={{ color: online ? '#4ade80' : '#f87171', fontWeight: 600 }}>
            {online ? '🟢 Connected to Internet' : '🔴 Offline'}
          </span>
        </Row>
        <Row label="Platform"><span className="settings-label" style={{ color: 'var(--color-text-secondary)' }}>Windows 10 / 11 (x64)</span></Row>
      </Section>

      <Section title="Software & Git Auto-Updates">
        <Row label="Automatically check for updates">
          <Toggle id="tog-autoupdate" value={s.autoCheckUpdates} onChange={v => set('autoCheckUpdates', v)} />
        </Row>
        <Row label="Automatically download updates">
          <Toggle id="tog-autodown" value={s.autoDownloadUpdates} onChange={v => set('autoDownloadUpdates', v)} />
        </Row>

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {updateInfo?.message || 'Check for new features from Git remote repository'}
            </span>
            <button
              onClick={handleCheckUpdate}
              disabled={checking || updating}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {checking ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>

          {updateInfo?.updateAvailable && (
            <div style={{
              marginTop: '8px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa' }}>Update Ready from Git!</div>
                <div style={{ fontSize: '11px', color: '#93c5fd' }}>Branch: {updateInfo.branch} ({updateInfo.commitsBehind} new commit(s))</div>
              </div>
              <button
                onClick={handleApplyUpdate}
                disabled={updating}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#3b82f6',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {updating ? 'Updating...' : 'Update & Restart'}
              </button>
            </div>
          )}
        </div>
      </Section>
      <div className="about-links">
        <a id="link-github" href="https://github.com" target="_blank" rel="noreferrer" className="about-link">
          <span>⭐</span> GitHub
        </a>
        <a id="link-bug" href="https://github.com/issues" target="_blank" rel="noreferrer" className="about-link">
          <span>🐛</span> Report Bug
        </a>
      </div>

      <div className="about-footer">Made with ♥ by not so boring people</div>
    </>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function SettingsPanel({ open, onClose, initialTab, isStandalone, settings: propSettings, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'general')
  const [localSettings, setLocalSettings] = useState(() => {
    if (propSettings) return normalizeSettings(propSettings)
    try {
      const saved = localStorage.getItem('edge-go-settings')
      return saved ? normalizeSettings(JSON.parse(saved)) : normalizeSettings(DEFAULT_SETTINGS)
    } catch {
      return normalizeSettings(DEFAULT_SETTINGS)
    }
  })

  // Use effective settings (prop if provided, else local)
  const settings = useMemo(
    () => normalizeSettings(propSettings || localSettings),
    [propSettings, localSettings]
  )

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (!window.electronAPI?.onOpenSettingsTab) return undefined
    return window.electronAPI.onOpenSettingsTab(tab => {
      if (NAV.some(item => item.id === tab)) setActiveTab(tab)
    })
  }, [])

  useEffect(() => {
    if (!propSettings) {
      saveStoredSettings(settings)
      if (window.electronAPI?.updateSettings) {
        window.electronAPI.updateSettings(settings)
      }
    }
  }, [settings, propSettings])

  useEffect(() => {
    applySettingsToDocument(settings)
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
      setLocalSettings(s => normalizeSettings({ ...s, [key]: value }))
    }
  }

  const resetAll = () => {
    const next = normalizeSettings(DEFAULT_SETTINGS)
    saveStoredSettings(next)
    setLocalSettings(next)
    if (onSettingsChange) onSettingsChange(() => next)
    window.electronAPI?.updateSettings?.(next)
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
    agent:      <AgentTab s={settings} set={set} />,
    shortcuts:  <ShortcutsTab />,
    advanced:   <AdvancedTab s={settings} set={set} onReset={resetAll} />,
    about:      <AboutTab s={settings} set={set} />,
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
