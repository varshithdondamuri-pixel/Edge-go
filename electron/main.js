// ============================================================================
// NOTE: Edge Go is designed, optimized, and built exclusively for Windows.
// All macOS-specific code (like AppleScript or mock controls) is purely for
// local development/testing purposes and is not supported in production.
// ============================================================================

const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  screen,
  nativeImage,
  globalShortcut,
  clipboard,
} = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const dns = require('dns')
const { exec, spawn } = require('child_process')

const isDev = !app.isPackaged

// Set Application User Model ID for Windows shortcuts, notifications, and SMTC registration
if (process.platform === 'win32') {
  app.setAppUserModelId('com.edgego.app')
}

// ─── Single instance lock ────────────────────────────────────────────────────
// Ensures only one copy of Edge Go runs at a time.
// The installer uses this to detect and gracefully close the running instance.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  // If a second instance is launched (e.g. from Start Menu while already running),
  // focus the existing main window instead of spawning a duplicate.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    showMainWindow()
  }
})


let mainWindow
let settingsWindow
let tray
let winMediaProcess = null
let lastWindowsMediaData = []
let lastKnownVolume = 50
let lastSmtcNonEmptyAt = 0
let spotifyFallbackActive = false
let pendingVolumeFallbackTimer = null
let boundsTimeout = null

let SETTINGS_PATH = null
function getSettingsPath() {
  if (!SETTINGS_PATH) {
    SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')
  }
  return SETTINGS_PATH
}

function loadSettings() {
  try {
    const sp = getSettingsPath()
    if (fs.existsSync(sp)) {
      const data = fs.readFileSync(sp, 'utf8')
      return JSON.parse(data) || {}
    }
  } catch (e) {
    console.error('[Settings] Failed to load settings:', e.message)
  }
  return {}
}

function saveSettings(settings) {
  try {
    const sp = getSettingsPath()
    fs.writeFileSync(sp, JSON.stringify(settings, null, 2), 'utf8')
  } catch (e) {
    console.error('[Settings] Failed to save settings:', e.message)
  }
}

const savedSettings = loadSettings()

// Tracks the notch's saved position so restores are correct
const notchState = {
  position: ['left', 'center', 'right'].includes(savedSettings.notchPosition) ? savedSettings.notchPosition : 'center',
  collapsedWidth: Math.min(440, Math.max(240, Number(savedSettings.collapsedWidth) || 300)),
  expandedWidth: Math.min(800, Math.max(500, Number(savedSettings.expandedWidth) || 620)),
  state: 'collapsed',
  controlCenterOpen: false,
  controlCenterDocked: false,
  panelLocked: false,
}

const systemControlState = {
  dnd: false,
  nightLight: false,
  brightness: 72,
  wifi: true,
  bluetooth: true,
  airplaneMode: false,
}

const windowSettingsState = {
  alwaysOnTop: typeof savedSettings.alwaysOnTop === 'boolean' ? savedSettings.alwaysOnTop : true,
  showInTaskbar: typeof savedSettings.showInTaskbar === 'boolean' ? savedSettings.showInTaskbar : true,
  enableWindowShadow: typeof savedSettings.enableWindowShadow === 'boolean' ? savedSettings.enableWindowShadow : true,
}

const NOTCH_MERGED_HEIGHT = 36
const NOTCH_COLLAPSED_HEIGHT = 48
const NOTCH_EXPANDED_HEIGHT = 240

// ─── Helpers ────────────────────────────────────────────────────────────────

let lastCpuTimes = { idle: 0, total: 1 }
try {
  lastCpuTimes = getCpuTimes()
} catch {}

function getCpuTimes() {
  const cpus = os.cpus()
  if (!cpus || cpus.length === 0) return { idle: 0, total: 1 }
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0
  for (const cpu of cpus) {
    user += cpu.times.user
    nice += cpu.times.nice
    sys += cpu.times.sys
    idle += cpu.times.idle
    irq += cpu.times.irq
  }
  const total = user + nice + sys + idle + irq
  return { idle, total }
}

function getCpuUsage() {
  const current = getCpuTimes()
  const idleDiff = current.idle - lastCpuTimes.idle
  const totalDiff = current.total - lastCpuTimes.total
  lastCpuTimes = current
  if (totalDiff === 0) return 0
  return Math.min(100, Math.max(0, Math.round((1 - idleDiff / totalDiff) * 100)))
}

/**
 * Run a PowerShell command safely using -EncodedCommand to avoid
 * escaping issues with quotes inside the script.
 */
function runPowerShell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10000,
      windowsHide: true,
    }, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function psSingleQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function getPrimaryWorkArea() {
  return screen.getPrimaryDisplay().workAreaSize
}

function getNotchX(screenWidth, width = notchState.collapsedWidth) {
  switch (notchState.position) {
    case 'left':
      return 16
    case 'right':
      return Math.max(0, screenWidth - width - 16)
    default:
      return Math.floor(screenWidth / 2 - width / 2)
  }
}

function getExpandedX(screenWidth) {
  const collapsedWidth = notchState.collapsedWidth
  const expandedWidth = notchState.expandedWidth
  const collapsedX = getNotchX(screenWidth, collapsedWidth)
  return Math.floor(clamp(
    collapsedX - (expandedWidth - collapsedWidth) / 2,
    0,
    Math.max(0, screenWidth - expandedWidth)
  ))
}

function applyWindowEffects(settings = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (typeof settings.alwaysOnTop === 'boolean') {
    windowSettingsState.alwaysOnTop = settings.alwaysOnTop
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
  }
  if (typeof settings.showInTaskbar === 'boolean') {
    windowSettingsState.showInTaskbar = settings.showInTaskbar
    mainWindow.setSkipTaskbar(!settings.showInTaskbar)
  }
  if (typeof settings.enableWindowShadow === 'boolean') {
    windowSettingsState.enableWindowShadow = settings.enableWindowShadow
    mainWindow.setHasShadow(settings.enableWindowShadow)
  }
}

function applyNotchBounds(animate = true) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const display = screen.getPrimaryDisplay()
  const sw = display.workArea.width
  const sh = display.workArea.height
  // Use bounds.y (full-screen top) so the notch always anchors at y=0
  // on Windows with a bottom taskbar (workArea.y is 0 but bounds.y is always the physical top)
  const notchY = display.bounds.y

  if (boundsTimeout) {
    clearTimeout(boundsTimeout)
    boundsTimeout = null
  }

  if (notchState.controlCenterOpen) {
    if (notchState.controlCenterDocked) {
      const panelWidth = 740
      const panelHeight = Math.min(600, sh - 20)
      const x = Math.max(0, sw - panelWidth - 16)
      mainWindow.setBounds({ width: panelWidth, height: panelHeight, x, y: notchY }, false)
    } else {
      const displayHeight = process.platform === 'darwin' ? display.bounds.height : sh
      mainWindow.setBounds({ width: sw, height: displayHeight, x: 0, y: notchY }, false)
    }
    mainWindow.setIgnoreMouseEvents(false)
    // Make window focusable so sliders/inputs work inside the Control Center
    if (!mainWindow.isFocusable()) {
      mainWindow.setFocusable(true)
    }
    mainWindow.focus()
    return
  }
  // Control Center closed — restore click-through for the notch
  mainWindow.setIgnoreMouseEvents(false) // notch still needs hover
  try {
    const shouldBeFocusable = notchState.state !== 'merged'
    if (mainWindow.isFocusable() !== shouldBeFocusable) {
      mainWindow.setFocusable(shouldBeFocusable)
    }
  } catch {}

  let width = notchState.collapsedWidth
  let height = NOTCH_COLLAPSED_HEIGHT
  let x = getNotchX(sw, width)

  if (notchState.state === 'expanded') {
    width = notchState.expandedWidth
    height = NOTCH_EXPANDED_HEIGHT
    x = getExpandedX(sw)
  } else if (notchState.state === 'merged') {
    width = 140
    height = NOTCH_MERGED_HEIGHT
    x = getNotchX(sw, width)
  } else {
    // collapsed
    width = notchState.collapsedWidth
    height = NOTCH_COLLAPSED_HEIGHT
    x = getNotchX(sw, width)
  }

  const currentBounds = mainWindow.getBounds()
  const isExpanding = (width > currentBounds.width || height > currentBounds.height || x !== currentBounds.x)

  if (isExpanding) {
    mainWindow.setBounds({ width, height, x, y: notchY }, false)
  } else {
    boundsTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBounds({ width, height, x, y: notchY }, false)
      }
    }, 350)
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (!notchState.controlCenterOpen && notchState.state === 'merged') {
    notchState.state = 'collapsed'
  }

  try { mainWindow.setFocusable(true) } catch {}
  try { mainWindow.setSkipTaskbar(!windowSettingsState.showInTaskbar) } catch {}

  mainWindow.show()
  applyNotchBounds(false)
  mainWindow.setAlwaysOnTop(windowSettingsState.alwaysOnTop, 'screen-saver')

  try { mainWindow.moveTop() } catch {}
  try { mainWindow.focus() } catch {}
}

function sanitizeSettings(settings = {}) {
  return {
    ...settings,
    notchPosition: ['left', 'center', 'right'].includes(settings.notchPosition)
      ? settings.notchPosition
      : notchState.position,
    collapsedWidth: clamp(Number(settings.collapsedWidth) || notchState.collapsedWidth, 240, 440),
    expandedWidth: clamp(Number(settings.expandedWidth) || notchState.expandedWidth, 500, 800),
  }
}

// ─── Window creation ────────────────────────────────────────────────────────

function createWindow() {
  const display = screen.getPrimaryDisplay()
  const sw = display.workArea.width
  // On Windows with taskbar at bottom, workArea.y is 0.
  // Use bounds.y (full screen top) so the notch always anchors at y=0
  const notchY = display.bounds.y

  mainWindow = new BrowserWindow({
    width: notchState.collapsedWidth,
    height: NOTCH_COLLAPSED_HEIGHT,
    x: getNotchX(sw, notchState.collapsedWidth),
    y: notchY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    thickFrame: false,
    alwaysOnTop: true,
    skipTaskbar: !windowSettingsState.showInTaskbar,
    resizable: false,
    movable: true,
    hasShadow: false,
    show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(err => console.error('Failed to load main window:', err))
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(err => console.error('Failed to load main window:', err))
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.once('ready-to-show', () => {
    // setVisibleOnAllWorkspaces is macOS-only — skip on Windows to avoid errors
    if (process.platform !== 'win32') {
      try { mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) } catch {}
    }
    showMainWindow()
  })

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed() && windowSettingsState.alwaysOnTop) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
    }
    if (!notchState.controlCenterOpen && notchState.state === 'merged') {
      try { mainWindow.setFocusable(false) } catch {}
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createSettingsWindow(tab = 'general') {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.focus()
    settingsWindow.webContents.send('open-settings-tab', tab)
    return
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  settingsWindow = new BrowserWindow({
    width: Math.min(1200, sw * 0.85),
    height: Math.min(850, sh * 0.85),
    minWidth: 900,
    minHeight: 600,
    title: 'Edge Go Settings',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    settingsWindow.loadURL(`http://localhost:5173/#settings?tab=${tab}`).catch(err => console.error('Failed to load settings window:', err))
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `settings?tab=${tab}` }).catch(err => console.error('Failed to load settings window:', err))
  }

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

// ─── Tray ────────────────────────────────────────────────────────────────────

function createTray() {
  let icon
  try {
    const iconPath = path.join(__dirname, '../public/tray-icon.png')
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) icon = nativeImage.createEmpty()
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)

  const buildMenu = () =>
    Menu.buildFromTemplate([
      { label: 'Edge Go v' + app.getVersion(), enabled: false },
      { type: 'separator' },
      {
        label: mainWindow?.isVisible() ? 'Hide Edge Go' : 'Show Edge Go',
        click: () => {
          if (!mainWindow) return
          if (mainWindow.isVisible()) mainWindow.hide()
          else showMainWindow()
          tray.setContextMenu(buildMenu())
        },
      },
      {
        label: 'Settings',
        click: () => createSettingsWindow(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ])

  tray.setToolTip('Edge Go')
  tray.setContextMenu(buildMenu())

  // Left-click on tray toggles window
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else showMainWindow()
    tray.setContextMenu(buildMenu())
  })
}

// ─── IPC: Battery ─────────────────────────────────────────────────────────

ipcMain.handle('get-battery', async () => {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      exec('pmset -g batt', (err, stdout) => {
        if (err || !stdout) {
          return resolve({ level: 100, charging: false, available: false, acConnected: false, timeRemaining: '' })
        }
        try {
          const lines = stdout.split('\n')
          const firstLine = lines[0] || ''
          const secondLine = lines[1] || ''
          
          const acConnected = firstLine.includes('AC Power')
          
          const levelMatch = secondLine.match(/(\d+)%/)
          const level = levelMatch ? parseInt(levelMatch[1], 10) : 100
          
          const charging = secondLine.includes('charging')
          
          let timeRemaining = ''
          const timeMatch = secondLine.match(/(\d+:\d+)\s+(remaining|until\s+full)/)
          if (timeMatch) {
            const parts = timeMatch[1].split(':')
            const h = parseInt(parts[0], 10)
            const m = parseInt(parts[1], 10)
            timeRemaining = h > 0 ? `${h}h ${m}m` : `${m}m`
          } else if (secondLine.includes('no estimate') || secondLine.includes('calculating')) {
            timeRemaining = 'Estimating...'
          }
          
          resolve({
            level,
            charging,
            available: true,
            acConnected,
            timeRemaining
          })
        } catch (e) {
          resolve({ level: 100, charging: false, available: false, acConnected: false, timeRemaining: '' })
        }
      })
    })
  }

  if (process.platform !== 'win32') {
    return { level: 100, charging: false, available: false, acConnected: false, timeRemaining: '' }
  }
  try {
    const out = await runPowerShell(`
$battery = Get-CimInstance Win32_Battery | Select-Object -First 1
if ($battery) {
  $charging = ($battery.BatteryStatus -eq 2 -or $battery.BatteryStatus -eq 6 -or $battery.BatteryStatus -eq 7 -or $battery.BatteryStatus -eq 8 -or $battery.BatteryStatus -eq 9)
  $ac = ($battery.BatteryStatus -ne 1)
  $mins = $battery.EstimatedRunTime
  $timeRemaining = ""
  if ($mins -and $mins -lt 71582788 -and $mins -gt 0) {
    $h = [math]::Floor($mins / 60)
    $m = $mins % 60
    if ($h -gt 0) { $timeRemaining = "$($h)h $($m)m" } else { $timeRemaining = "$($m)m" }
  }
  [PSCustomObject]@{
    level = [int]$battery.EstimatedChargeRemaining
    charging = $charging
    available = $true
    acConnected = $ac
    timeRemaining = $timeRemaining
  } | ConvertTo-Json -Compress
} else {
  [PSCustomObject]@{ level = 100; charging = $false; available = $false; acConnected = $false; timeRemaining = "" } | ConvertTo-Json -Compress
}
`)
    return JSON.parse(out.trim())
  } catch (e) {
    console.error('get-battery error:', e.message)
    return { level: 100, charging: false, available: false, acConnected: false, timeRemaining: '' }
  }
})

// ─── IPC: System Info ─────────────────────────────────────────────────────

ipcMain.handle('get-system-info', () => ({
  platform: process.platform,
  hostname: os.hostname(),
  arch: os.arch(),
  version: app.getVersion(),
}))

// ─── IPC: System Resource Usage ───────────────────────────────────────────────

ipcMain.handle('get-system-usage', () => {
  try {
    const ramTotal = os.totalmem() / (1024 * 1024 * 1024)
    const ramFree = os.freemem() / (1024 * 1024 * 1024)
    const ramUsed = ramTotal - ramFree
    const cpu = getCpuUsage()
    return { cpu, ramUsed, ramTotal }
  } catch {
    return { cpu: 0, ramUsed: 0, ramTotal: 1 }
  }
})



let cachedSystemState = null
let lastSystemStateFetchTime = 0

async function getWindowsSystemState() {
  if (process.platform !== 'win32') return { ...systemControlState }
  const now = Date.now()
  if (cachedSystemState && now - lastSystemStateFetchTime < 3000) {
    return cachedSystemState
  }

  try {
    const out = await runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
$brightness = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness
$toast = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -ErrorAction SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED

[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null

function Await-Async($op) {
  while ($op.Status -eq 'Started' -or $op.Status -eq 0) { [System.Threading.Thread]::Sleep(10) }
  return $op.GetResults()
}

$accessOp = [Windows.Devices.Radios.Radio]::RequestAccessAsync()
$access = Await-Async $accessOp

$radiosOp = [Windows.Devices.Radios.Radio]::GetRadiosAsync()
$radios = Await-Async $radiosOp

$wifiRadio = $radios | Where-Object { $_.Kind -eq 'WiFi' }
$bluetoothRadio = $radios | Where-Object { $_.Kind -eq 'Bluetooth' }

[PSCustomObject]@{
  brightness = if ($brightness -ne $null) { [int]$brightness } else { $null }
  dnd = ($toast -eq 0)
  wifi = if ($wifiRadio) { $wifiRadio.State -eq 'On' } else { $null }
  bluetooth = if ($bluetoothRadio) { $bluetoothRadio.State -eq 'On' } else { $null }
} | ConvertTo-Json -Compress
`)
    const parsed = JSON.parse(out.trim())
    cachedSystemState = {
      ...systemControlState,
      brightness: parsed.brightness ?? systemControlState.brightness,
      dnd: typeof parsed.dnd === 'boolean' ? parsed.dnd : systemControlState.dnd,
      wifi: typeof parsed.wifi === 'boolean' ? parsed.wifi : systemControlState.wifi,
      bluetooth: typeof parsed.bluetooth === 'boolean' ? parsed.bluetooth : systemControlState.bluetooth,
    }
    lastSystemStateFetchTime = now
    return cachedSystemState
  } catch (e) {
    console.error('get-system-state error:', e.message)
    return { ...systemControlState }
  }
}

let cachedWifiNetworks = null
let lastWifiFetchTime = 0

async function getWindowsWifiNetworks() {
  if (process.platform !== 'win32') {
    return [
      { id: 'n1', name: 'HomeNetwork_5G', strength: 4, secured: true, connected: true, saved: true },
      { id: 'n2', name: 'CoffeeShop_Free', strength: 2, secured: false, connected: false, saved: false },
      { id: 'n3', name: 'Office_WiFi', strength: 3, secured: true, connected: false, saved: true },
    ]
  }

  const now = Date.now()
  if (cachedWifiNetworks && now - lastWifiFetchTime < 10000) {
    return cachedWifiNetworks
  }

  try {
    const out = await runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
$connected = ''
foreach ($line in @(netsh wlan show interfaces)) {
  if ($line -match '^\\s*SSID\\s*:\\s*(.+)$' -and $line -notmatch 'BSSID') {
    $connected = $Matches[1].Trim()
    break
  }
}

$profiles = @()
foreach ($line in @(netsh wlan show profiles)) {
  if ($line -match ':\\s*(.+)$') { $profiles += $Matches[1].Trim() }
}

$items = @()
$current = $null
foreach ($line in @(netsh wlan show networks mode=bssid)) {
  if ($line -match '^\\s*SSID\\s+\\d+\\s*:\\s*(.*)$') {
    if ($current -and $current.name) { $items += [PSCustomObject]$current }
    $current = [ordered]@{
      name = $Matches[1].Trim()
      strength = 1
      secured = $true
      connected = $false
      saved = $false
    }
  } elseif ($current -and $line -match '^\\s*Authentication\\s*:\\s*(.+)$') {
    $current.secured = ($Matches[1].Trim() -notmatch 'Open')
  } elseif ($current -and $line -match '^\\s*Signal\\s*:\\s*(\\d+)%') {
    $pct = [int]$Matches[1]
    $current.strength = [Math]::Max(1, [Math]::Min(4, [Math]::Ceiling($pct / 25)))
  }
}
if ($current -and $current.name) { $items += [PSCustomObject]$current }

foreach ($item in $items) {
  $item.connected = ($item.name -eq $connected)
  $item.saved = ($profiles -contains $item.name)
}

@($items | Sort-Object -Property connected, strength -Descending | Select-Object -First 12) | ConvertTo-Json -Compress
`)
    const parsed = out.trim() ? JSON.parse(out.trim()) : []
    const networks = Array.isArray(parsed) ? parsed : [parsed]
    cachedWifiNetworks = networks
      .filter(network => network && network.name)
      .map((network, idx) => ({
        id: `${network.name}-${idx}`,
        name: String(network.name),
        strength: clamp(Number(network.strength) || 1, 1, 4),
        secured: !!network.secured,
        connected: !!network.connected,
        saved: !!network.saved,
      }))
    lastWifiFetchTime = now
    return cachedWifiNetworks
  } catch (e) {
    console.error('get-wifi-networks error:', e.message)
    return []
  }
}

async function connectWindowsWifiNetwork(ssid) {
  const networkName = String(ssid || '').trim()
  if (!networkName) return { ok: false, error: 'Missing Wi-Fi network name' }

  if (process.platform !== 'win32') {
    return { ok: true, simulated: true, network: networkName }
  }

  try {
    await runPowerShell(`
$ErrorActionPreference = 'Stop'
$ssid = ${psSingleQuote(networkName)}
$profiles = @()
foreach ($line in @(netsh wlan show profiles)) {
  if ($line -match ':\\s*(.+)$') { $profiles += $Matches[1].Trim() }
}
if ($profiles -notcontains $ssid) {
  throw "Saved profile not found for '$ssid'. Connect once in Windows Wi-Fi settings, then Edge Go can reconnect it."
}
netsh wlan connect name="$ssid" | Out-Null
Start-Sleep -Milliseconds 800
`)
    return { ok: true, network: networkName }
  } catch (e) {
    console.error('connect-wifi-network error:', e.message)
    return { ok: false, error: e.message }
  }
}

async function setSystemControl(control, value) {
  if (process.platform !== 'win32') {
    systemControlState[control] = value
    return { ok: true, simulated: true, state: { ...systemControlState } }
  }

  const boolValue = value ? '$true' : '$false'
  const numberValue = clamp(Number(value) || 0, 0, 100)
  let script = ''

  if (control === 'brightness') {
    script = `
$ErrorActionPreference = 'Stop'
$level = ${numberValue}
$set = $false

$cimMethods = @(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue)
foreach ($method in $cimMethods) {
  try {
    Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = $level } -ErrorAction Stop | Out-Null
    $set = $true
  } catch {}
}

if (-not $set) {
  $wmiMethods = @(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue)
  foreach ($method in $wmiMethods) {
    try {
      $method.WmiSetBrightness(1, $level) | Out-Null
      $set = $true
    } catch {}
  }
}

if (-not $set) { throw 'No controllable laptop brightness interface found' }
Start-Sleep -Milliseconds 120
$current = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness
if ($current -ne $null) {
  [int]$current
} else {
  [int]$level
}
`
  } else if (control === 'dnd') {
    const val = value ? 0 : 1
    script = `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' -Value ${val} -Force`
  } else if (control === 'nightLight') {
    script = `
$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultNetworkCloudStore\\Data\\Microsoft.Settings.Displays.BlueLightReduction.Setting'
$data = (Get-ItemProperty -Path $path -ErrorAction Stop).Data
if ($data -and $data.Length -gt 24) {
  $data[24] = if (${boolValue}) { 0x15 } else { 0x10 }
  Set-ItemProperty -Path $path -Name 'Data' -Value $data
}
`
  } else if (control === 'wifi' || control === 'bluetooth') {
    const radioKind = control === 'wifi' ? 'WiFi' : 'Bluetooth'
    const netshFallback = control === 'wifi'
      ? `
if (-not $setOk) {
  $wifiName = ''
  foreach ($line in @(netsh wlan show interfaces)) {
    if ($line -match '^\\s*Name\\s*:\\s*(.+)$') {
      $wifiName = $Matches[1].Trim()
      break
    }
  }
  if (-not $wifiName) { $wifiName = 'Wi-Fi' }
  $stateText = if (${boolValue}) { 'enabled' } else { 'disabled' }
  netsh interface set interface name="$wifiName" admin=$stateText | Out-Null
  $setOk = $true
}
`
      : ''
    script = `
$ErrorActionPreference = 'Stop'
[Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null

function Await-Async($op) {
  while ($op.Status -eq 'Started' -or $op.Status -eq 0) { [System.Threading.Thread]::Sleep(10) }
  return $op.GetResults()
}

$state = if (${boolValue}) { 'On' } else { 'Off' }
$setOk = $false
$radio = $null
try {
  $accessOp = [Windows.Devices.Radios.Radio]::RequestAccessAsync()
  $access = Await-Async $accessOp

  $radiosOp = [Windows.Devices.Radios.Radio]::GetRadiosAsync()
  $radios = Await-Async $radiosOp

  $radio = $radios | Where-Object { $_.Kind -eq '${radioKind}' }
} catch {}

if ($radio) {
  try {
    $setStateOp = $radio.SetStateAsync($state)
    $null = Await-Async $setStateOp
    $setOk = $true
  } catch {}
}
${netshFallback}
if (-not $setOk) { throw '${radioKind} radio not found or not controllable' }
`
  } else if (control === 'airplaneMode') {
    if (value) {
      await setSystemControl('wifi', false).catch(() => null)
      await setSystemControl('bluetooth', false).catch(() => null)
    } else {
      await setSystemControl('wifi', true).catch(() => null)
      await setSystemControl('bluetooth', true).catch(() => null)
    }
    systemControlState.airplaneMode = !!value
    return { ok: true, state: { ...systemControlState } }
  } else {
    return { ok: false, error: `Unknown system control: ${control}` }
  }

  try {
    const out = await runPowerShell(script)
    if (control === 'brightness') {
      const actual = Number.parseInt(String(out).trim().split(/\s+/).pop(), 10)
      systemControlState.brightness = Number.isFinite(actual) ? clamp(actual, 0, 100) : numberValue
    } else {
      systemControlState[control] = !!value
    }
    return { ok: true, state: { ...systemControlState } }
  } catch (e) {
    console.error(`set-system-control ${control} error:`, e.message)
    return { ok: false, error: e.message, state: { ...systemControlState } }
  }
}

ipcMain.handle('get-system-state', async () => getWindowsSystemState())

ipcMain.handle('get-wifi-networks', async () => getWindowsWifiNetworks())

ipcMain.handle('connect-wifi-network', async (_, ssid) => connectWindowsWifiNetwork(ssid))

ipcMain.handle('set-system-control', async (_, control, value) => setSystemControl(control, value))

// ─── macOS Media Getters ───────────────────────────────────────────────────

function parseAppleScriptOutput(output) {
  const parts = output.split('|||')
  if (parts.length === 8) {
    return {
      title: parts[0] || 'Unknown Title',
      artist: parts[1] || '',
      album: parts[2] || '',
      duration: parseFloat(parts[3]) || 0,
      position: parseFloat(parts[4]) || 0,
      isPlaying: parts[5].toLowerCase().includes('playing'),
      volume: parseInt(parts[6]) || 50,
      source: parts[7] || 'Media',
      sourceAppId: parts[7] || '',
      isCurrent: parts[5].toLowerCase().includes('playing'),
      playbackStatus: parts[5] || '',
      albumArt: null,
    }
  }
  return null
}

function getMacSpotifyInfo() {
  return new Promise((resolve) => {
    const script = `
      tell application "Spotify"
        try
          set t_state to player state as string
          set t_name to name of current track
          set t_artist to artist of current track
          set t_album to album of current track
          set t_duration to (duration of current track) / 1000
          set t_position to player position
          set t_volume to sound volume
          return t_name & "|||" & t_artist & "|||" & t_album & "|||" & t_duration & "|||" & t_position & "|||" & t_state & "|||" & t_volume & "|||" & "Spotify"
        on error
          return ""
        end try
      end tell
    `
    exec(`osascript -e '${script}'`, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) {
        resolve(null)
      } else {
        resolve(parseAppleScriptOutput(stdout.trim()))
      }
    })
  })
}

function getMacMusicInfo() {
  return new Promise((resolve) => {
    const script = `
      tell application "Music"
        try
          set t_state to player state as string
          set t_name to name of current track
          set t_artist to artist of current track
          set t_album to album of current track
          set t_duration to duration of current track
          set t_position to player position
          set t_volume to sound volume
          return t_name & "|||" & t_artist & "|||" & t_album & "|||" & t_duration & "|||" & t_position & "|||" & t_state & "|||" & t_volume & "|||" & "Apple Music"
        on error
          return ""
        end try
      end tell
    `
    exec(`osascript -e '${script}'`, (err, stdout) => {
      if (err || !stdout || !stdout.trim()) {
        resolve(null)
      } else {
        resolve(parseAppleScriptOutput(stdout.trim()))
      }
    })
  })
}

// ─── IPC: Media Info (cross-platform) ──────────────────────────────────────

// Shared store — whichever platform daemon fills this, the renderer reads it.
let lastMediaData = []

ipcMain.handle('get-media-info', async () => {
  if (process.platform === 'darwin') {
    try {
      const results = await Promise.all([
        getMacSpotifyInfo(),
        getMacMusicInfo()
      ])
      return results.filter(Boolean)
    } catch (e) {
      console.error('macOS get-media-info error:', e.message)
      return []
    }
  }
  return lastMediaData
})

// Push updates to renderer whenever media changes
function pushMediaUpdate(data) {
  lastMediaData = data
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('media-update', data)
  }
}



let winMediaRestartCount = 0
let lastWinMediaRestartTime = 0

function startWindowsMediaDaemon() {
  if (process.platform !== 'win32') return

  const now = Date.now()
  if (now - lastWinMediaRestartTime < 10000) {
    winMediaRestartCount++
  } else {
    winMediaRestartCount = 0
  }
  lastWinMediaRestartTime = now

  if (winMediaRestartCount > 5) {
    console.warn('Windows media daemon failed repeatedly. Falling back to Spotify window-title polling.')
    startSpotifyFallbackPoller()
    return
  }

  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Load WinRT classes dynamically
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSession, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Concurrent;
using System.Threading;

namespace EdgeGoAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorComObject {}

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    int GetDevice(string pwstrId, out IMMDevice ppDevice);
    int RegisterEndpointNotificationCallback(IntPtr pClient);
    int UnregisterEndpointNotificationCallback(IntPtr pClient);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId(out IntPtr ppstrId);
    int GetState(out int pdwState);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute(bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
  }

  public static class Volume {
    static IAudioEndpointVolume GetEndpoint() {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      IAudioEndpointVolume endpoint;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
      return endpoint;
    }

    public static void Set(float level) {
      try {
        IAudioEndpointVolume endpoint = GetEndpoint();
        var eventContext = Guid.Empty;
        Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(level, eventContext));
        Marshal.ThrowExceptionForHR(endpoint.SetMute(level <= 0.001f, eventContext));
      } catch {}
    }

    public static float Get() {
      try {
        IAudioEndpointVolume endpoint = GetEndpoint();
        float level;
        Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out level));
        return level;
      } catch {
        return 0.5f;
      }
    }
  }

  public static class StdinReader {
    private static ConcurrentQueue<string> queue = new ConcurrentQueue<string>();
    private static bool running = false;

    public static void Start() {
      if (running) return;
      running = true;
      Thread t = new Thread(() => {
        while (running) {
          try {
            string line = Console.ReadLine();
            if (line == null) break;
            queue.Enqueue(line);
          } catch {
            Thread.Sleep(100);
          }
        }
      });
      t.IsBackground = true;
      t.Start();
    }

    public static string GetNextCommand() {
      string cmd;
      if (queue.TryDequeue(out cmd)) {
        return cmd;
      }
      return null;
    }

    public static void Stop() {
      running = false;
    }
  }
}
'@

function Await-Async($op) {
  while ($op.Status -eq 'Started' -or $op.Status -eq 0) { [System.Threading.Thread]::Sleep(10) }
  return $op.GetResults()
}

$global:sessionManager = $null
$global:albumArtCache = @{}

function Get-SessionManager {
  if ($null -eq $global:sessionManager) {
    try {
      $mgrOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
      $global:sessionManager = Await-Async $mgrOp
    } catch {}
  }
  return $global:sessionManager
}

[EdgeGoAudio.StdinReader]::Start()

function Get-Sessions {
  $results = @()
  try {
    $manager = Get-SessionManager
    if (-not $manager) { return $results }

    $sessions = $manager.GetSessions()
    $currentSession = $manager.GetCurrentSession()
    $currentId = if ($currentSession) { $currentSession.SourceAppUserModelId } else { "" }

    foreach ($session in $sessions) {
      try {
        $propsOp = $session.TryGetMediaPropertiesAsync()
        $props = Await-Async $propsOp
        if (-not $props) { continue }

        $info = $session.GetPlaybackInfo()
        $timeline = $session.GetTimelineProperties()
        $src = $session.SourceAppUserModelId
        $srcLower = if ($src) { $src.ToLowerInvariant() } else { "" }

        $label = if ($srcLower.Contains("spotify")) { "Spotify" }
                 elseif ($srcLower.Contains("chrome")) { "Chrome" }
                 elseif ($srcLower.Contains("msedge")) { "Edge" }
                 elseif ($srcLower.Contains("firefox")) { "Firefox" }
                 elseif ($srcLower.Contains("vlc")) { "VLC" }
                 elseif ($srcLower.Contains("zune") -or $srcLower.Contains("groove")) { "Groove Music" }
                 elseif ($srcLower.Contains("wmplayer")) { "Windows Media Player" }
                 elseif ($srcLower.Contains("media.player") -or $srcLower.Contains("music")) { "Windows Media" }
                 elseif ($src) { $src }
                 else { "Media" }

        $albumArtStr = $null
        if ($src -eq $currentId -and $props.Thumbnail) {
          $cacheKey = "$src|$($props.Title)|$($props.Artist)"
          if ($global:albumArtCache.ContainsKey($cacheKey)) {
            $albumArtStr = $global:albumArtCache[$cacheKey]
          } else {
            try {
              $streamOp = $props.Thumbnail.OpenReadAsync()
              $stream = Await-Async $streamOp
              if ($stream) {
                $size = $stream.Size
                $reader = New-Object Windows.Storage.Streams.DataReader -ArgumentList ($stream.GetInputStreamAt(0))
                $loadOp = $reader.LoadAsync([uint32]$size)
                $loaded = Await-Async $loadOp
                
                $bytes = New-Object Byte[] $size
                $reader.ReadBytes($bytes)
                $base64 = [Convert]::ToBase64String($bytes)
                $contentType = $stream.ContentType
                if (-not $contentType) { $contentType = "image/jpeg" }
                $albumArtStr = "data:$contentType;base64,$base64"
                
                $reader.Dispose()
                $stream.Dispose()
                
                if ($global:albumArtCache.Count -gt 10) {
                  $global:albumArtCache.Clear()
                }
                $global:albumArtCache[$cacheKey] = $albumArtStr
              }
            } catch {}
          }
        }

        $vol = [math]::Round([EdgeGoAudio.Volume]::Get() * 100)

        $h = @{}
        $h["title"] = if ($props.Title) { $props.Title } else { "Unknown" }
        $h["artist"] = if ($props.Artist) { $props.Artist } else { "" }
        $h["album"] = if ($props.AlbumTitle) { $props.AlbumTitle } else { "" }
        $h["albumArt"] = $albumArtStr
        $h["isPlaying"] = ($info -and $info.PlaybackStatus.ToString() -eq 'Playing')
        $h["position"] = if ($timeline) { [Math]::Round($timeline.Position.TotalSeconds, 1) } else { 0.0 }
        $h["duration"] = if ($timeline) { [Math]::Round($timeline.EndTime.TotalSeconds, 1) } else { 0.0 }
        $h["source"] = $label
        $h["sourceAppId"] = if ($src) { $src } else { "" }
        $h["isCurrent"] = ($src -eq $currentId)
        $h["volume"] = $vol

        $results += $h
      } catch {}
    }
  } catch {}
  return $results
}

function Get-SpotifyTitle {
  $proc = Get-Process Spotify -ErrorAction SilentlyContinue |
          Where-Object { $_.MainWindowTitle -and
                         $_.MainWindowTitle -notmatch '^Spotify( Premium)?$' } |
          Select-Object -First 1
  if (-not $proc) { return $null }
  $t = $proc.MainWindowTitle
  if ($t -match '^(.+?)\\s[-\\u2013\\u2014]\\s(.+)$') {
    $vol = [math]::Round([EdgeGoAudio.Volume]::Get() * 100)
    return @{ title=$Matches[2].Trim(); artist=$Matches[1].Trim(); album='';
              albumArt=''; isPlaying=$true; position=0; duration=0;
              source='Spotify'; sourceAppId='com.spotify.client'; isCurrent=$true; volume=$vol }
  }
  return $null
}

function To-Json($h) {
  $f = @()
  foreach ($k in $h.Keys) {
    $v = $h[$k]
    if ($v -eq $null) {
      $f += '"'+$k+'":null'
    } elseif ($v -is [bool]) {
      $f += '"'+$k+'":'+$v.ToString().ToLower()
    } elseif ($v -is [int] -or $v -is [long]) {
      $f += '"'+$k+'":'+$v
    } elseif ($v -is [float] -or $v -is [double] -or $v -is [decimal]) {
      $str = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:F2}", $v)
      $f += '"'+$k+'":'+$str
    } else {
      $e = ([string]$v) -replace '\\\\','\\\\' -replace '"','\\"' -replace "[\\r\\n]",' '
      $f += '"'+$k+'":"'+$e+'"'
    }
  }
  '{' + ($f -join ',') + '}'
}

function Invoke-SessionCommand($command, $value, $source) {
  try {
    $manager = Get-SessionManager
    if (-not $manager) { return $false }

    $sessions = $manager.GetSessions()
    $target = if ($source) { $source.ToLower() } else { "" }
    $matched = $false

    $targetSession = $null
    foreach ($s in $sessions) {
      $id = ([string]$s.SourceAppUserModelId).ToLowerInvariant()
      $isSameFamily = (
        ($target.Contains("spotify") -and $id.Contains("spotify")) -or
        ($target.Contains("chrome") -and $id.Contains("chrome")) -or
        ($target.Contains("edge") -and ($id.Contains("edge") -or $id.Contains("msedge"))) -or
        ($target.Contains("firefox") -and $id.Contains("firefox")) -or
        ($target.Contains("vlc") -and $id.Contains("vlc"))
      )
      if ($target -and ($id.Contains($target) -or $target.Contains($id) -or $isSameFamily)) {
        $targetSession = $s
        break
      }
    }
    if (-not $targetSession) {
      $targetSession = $manager.GetCurrentSession()
    }
    if (-not $targetSession -and $sessions.Count -gt 0) {
      $targetSession = $sessions[0]
    }

    if (-not $targetSession) { return $false }

    if ($command -eq 'playpause') {
      $null = Await-Async ($targetSession.TryTogglePlayPauseAsync())
    } elseif ($command -eq 'play') {
      $null = Await-Async ($targetSession.TryPlayAsync())
    } elseif ($command -eq 'pause') {
      $null = Await-Async ($targetSession.TryPauseAsync())
    } elseif ($command -eq 'next') {
      $null = Await-Async ($targetSession.TrySkipNextAsync())
    } elseif ($command -eq 'prev' -or $command -eq 'previous') {
      $null = Await-Async ($targetSession.TrySkipPreviousAsync())
    } elseif ($command -eq 'seek') {
      $seekSec = 0.0
      if ([double]::TryParse($value, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$seekSec)) {
        $seekTicks = [Math]::Round($seekSec * 10000000)
        $null = Await-Async ($targetSession.TryChangePlaybackPositionAsync($seekTicks))
      }
    }
    return $true
  } catch {
    return $false
  }
}

$lastVolume = -1
$lastFingerprint = ""
$tick = 0

while ($true) {
  $forceMediaUpdate = $false

  # 1. Check stdin commands
  $cmd = [EdgeGoAudio.StdinReader]::GetNextCommand()
  while ($cmd -ne $null) {
    if ($cmd -match '^VOLUME:(.+)$') {
      $volVal = [float]::Parse($Matches[1], [System.Globalization.CultureInfo]::InvariantCulture)
      [EdgeGoAudio.Volume]::Set($volVal)
    } elseif ($cmd -match '^MEDIA:(.+?):(.*?):(.*)$') {
      $mediaCmd = $Matches[1]
      $mediaVal = $Matches[2]
      $mediaSrc = $Matches[3]
      $null = Invoke-SessionCommand $mediaCmd $mediaVal $mediaSrc
      $forceMediaUpdate = $true
    }
    $cmd = [EdgeGoAudio.StdinReader]::GetNextCommand()
  }

  # 2. Monitor and report volume changes
  try {
    $currentVol = [math]::Round([EdgeGoAudio.Volume]::Get() * 100)
    if ($currentVol -ne $lastVolume) {
      $lastVolume = $currentVol
      Write-Output "VOLUME_CHANGE:$currentVol"
    }
  } catch {}

  # 3. Periodically or on-demand output media sessions
  if ($forceMediaUpdate -or ($tick % 2 -eq 0) -or $tick -eq 0 -or $tick -ge 15) {
    $currentFingerprint = ""
    $out = '[]'
    try {
      $list = Get-Sessions
      if ($list -and $list.Count -gt 0) {
        $parts = @()
        $fpParts = @()
        foreach ($s in $list) {
          $parts += To-Json $s
          $fpParts += "$($s['sourceAppId'])|$($s['title'])|$($s['artist'])|$($s['isPlaying'])"
        }
        $out = '[' + ($parts -join ',') + ']'
        $currentFingerprint = $fpParts -join ';'
      } else {
        $sp = Get-SpotifyTitle
        if ($sp) {
          $out = '[' + (To-Json $sp) + ']'
          $currentFingerprint = "$($sp['sourceAppId'])|$($sp['title'])|$($sp['artist'])|$($sp['isPlaying'])"
        }
      }
    } catch {}

    $fingerprintChanged = ($currentFingerprint -ne $lastFingerprint)
    if ($fingerprintChanged) {
      $lastFingerprint = $currentFingerprint
    }

    if ($tick -eq 0 -or $tick -ge 15 -or $forceMediaUpdate -or $fingerprintChanged) {
      $tick = 0
      Write-Output "MEDIA_JSON:$out"
    }
  }

  $tick++
  Start-Sleep -Milliseconds 300
}
`

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
  const { spawn } = require('child_process')
  
  try {
    winMediaProcess = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand',
      encoded,
    ], { windowsHide: true })

    winMediaProcess.on('error', (err) => {
      console.error('[SMTC] Daemon spawn error:', err.message)
      winMediaProcess = null
      startSpotifyFallbackPoller()
    })
  } catch (err) {
    console.error('[SMTC] Exception spawning daemon:', err.message)
    winMediaProcess = null
    startSpotifyFallbackPoller()
  }

  if (winMediaProcess) {
    let buffer = ''
    winMediaProcess.stdout.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('VOLUME_CHANGE:')) {
          const vol = Number(trimmed.slice('VOLUME_CHANGE:'.length))
          if (!isNaN(vol)) {
            broadcastVolume(vol)
          }
          continue
        }
        if (trimmed.startsWith('MEDIA_JSON:')) {
          try {
            const parsed = JSON.parse(trimmed.slice('MEDIA_JSON:'.length))
            const sessions = Array.isArray(parsed) ? parsed.map(s => ({
              title:       s.title       || 'Unknown Title',
              artist:      s.artist      || '',
              album:       s.album       || '',
              albumArt:    s.albumArt    || null,
              duration:    Number(s.duration)  || 0,
              position:    Number(s.position)  || 0,
              isPlaying:   s.isPlaying === true || s.isPlaying === 'true',
              volume:      (s.volume !== undefined && s.volume !== null) ? Number(s.volume) : lastKnownVolume,
              source:      s.source      || 'Media',
              sourceAppId: s.sourceAppId || '',
              isCurrent:   s.isCurrent === true || s.isCurrent === 'true',
            })) : []
            if (sessions.length > 0) {
              lastSmtcNonEmptyAt = Date.now()
              spotifyFallbackActive = false
            }
            pushMediaUpdate(sessions)
          } catch (e) {
            console.error('[SMTC] JSON parse error:', e.message)
          }
        }
      }
    })

    winMediaProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg) console.warn('[SMTC stderr]', msg)
    })

    winMediaProcess.on('close', (code) => {
      console.log(`[SMTC] daemon exited (code=${code}), restarting in 5s…`)
      if (app.isReady() && !app.isQuitting) {
        setTimeout(startWindowsMediaDaemon, 5000)
      }
    })
  }

  startSpotifyFallbackPoller()
}


// ─── Spotify window-title fallback poller (Node-side, no PowerShell) ─────────
// Runs alongside SMTC and only publishes when SMTC is empty/stale. Spotify's
// window title is "Artist - Song" while something plays.
let spotifyFallbackTimer = null
function shouldUseSpotifyFallback() {
  const hasPlayingSession = lastMediaData.some(s => s?.isPlaying)
  const hasSpotifySession = lastMediaData.some(s => {
    const text = `${s?.source || ''} ${s?.sourceAppId || ''}`.toLowerCase()
    return text.includes('spotify')
  })
  return (
    spotifyFallbackActive ||
    lastMediaData.length === 0 ||
    Date.now() - lastSmtcNonEmptyAt > 5000 ||
    !hasPlayingSession ||
    !hasSpotifySession
  )
}

function startSpotifyFallbackPoller() {
  if (spotifyFallbackTimer || process.platform !== 'win32') return
  const poll = () => {
    if (!shouldUseSpotifyFallback()) return
    exec('tasklist /FI "IMAGENAME eq Spotify.exe" /FO CSV /NH /V', { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) {
        if (spotifyFallbackActive && Date.now() - lastSmtcNonEmptyAt > 5000) {
          spotifyFallbackActive = false
          pushMediaUpdate([])
        }
        return
      }
      for (const line of stdout.split('\n')) {
        const cols = line.split('","')
        if (cols.length < 9) continue
        const title = (cols[8] || '').replace(/"/g, '').trim()
        if (!title || /^Spotify( Premium)?$/.test(title)) continue
        const m = title.match(/^(.+?)\s[-\u2013\u2014]\s(.+)$/)
        if (!m) continue
        const payload = [{
          title: m[2].trim(), artist: m[1].trim(), album: '',
          albumArt: null, duration: 0, position: 0, isPlaying: true,
          volume: lastKnownVolume, source: 'Spotify', sourceAppId: 'com.spotify.client', isCurrent: true,
        }]
        if (shouldUseSpotifyFallback()) {
          spotifyFallbackActive = true
          pushMediaUpdate(payload)
        }
        return
      }
      if (spotifyFallbackActive && Date.now() - lastSmtcNonEmptyAt > 5000) {
        spotifyFallbackActive = false
        pushMediaUpdate([])
      }
    })
  }
  poll()
  spotifyFallbackTimer = setInterval(poll, 8000)
}

// ─── IPC: Media Commands (Windows SMTC) ─────────────────────────────────────

function broadcastVolume(level) {
  const nextLevel = clamp(Number(level) || 0, 0, 100)
  lastKnownVolume = nextLevel
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('volume-updated', nextLevel)
    }
  })
}

function sendDaemonCommand(cmd) {
  if (winMediaProcess && winMediaProcess.stdin && !winMediaProcess.stdin.destroyed) {
    try {
      winMediaProcess.stdin.write(cmd + '\n')
      return true
    } catch (e) {
      console.error('[SMTC] Stdin write error:', e.message)
    }
  }
  return false
}

function windowsVolumeScript(level, shouldSet = false) {
  const scalar = clamp(Number(level) || 0, 0, 100) / 100
  const setLine = shouldSet ? `[EdgeGoAudioFallback.Volume]::Set([single]${scalar})` : ''
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace EdgeGoAudioFallback {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorComObject {}

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    int GetDevice(string pwstrId, out IMMDevice ppDevice);
    int RegisterEndpointNotificationCallback(IntPtr pClient);
    int UnregisterEndpointNotificationCallback(IntPtr pClient);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IAudioEndpointVolume ppInterface);
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId(out IntPtr ppstrId);
    int GetState(out int pdwState);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out int pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute(bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
  }

  public static class Volume {
    static IAudioEndpointVolume GetEndpoint() {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      IAudioEndpointVolume endpoint;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
      return endpoint;
    }

    public static void Set(float level) {
      IAudioEndpointVolume endpoint = GetEndpoint();
      var eventContext = Guid.Empty;
      Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(level, eventContext));
      Marshal.ThrowExceptionForHR(endpoint.SetMute(level <= 0.001f, eventContext));
    }

    public static float Get() {
      IAudioEndpointVolume endpoint = GetEndpoint();
      float level;
      Marshal.ThrowExceptionForHR(endpoint.GetMasterVolumeLevelScalar(out level));
      return level;
    }
  }
}
'@
${setLine}
[math]::Round([EdgeGoAudioFallback.Volume]::Get() * 100)
`
}

async function setWindowsVolumeDirect(level) {
  const out = await runPowerShell(windowsVolumeScript(level, true))
  const parsedOut = Number.parseInt(out.trim(), 10)
  const actual = clamp(!isNaN(parsedOut) ? parsedOut : (Number(level) || 0), 0, 100)
  broadcastVolume(actual)
  return actual
}

async function readWindowsVolumeDirect() {
  const out = await runPowerShell(windowsVolumeScript(0, false))
  const actual = clamp(Number.parseInt(out.trim(), 10) || 0, 0, 100)
  broadcastVolume(actual)
  return actual
}

function scheduleWindowsVolumeFallback(level, delay = 140) {
  if (process.platform !== 'win32') return
  if (pendingVolumeFallbackTimer) clearTimeout(pendingVolumeFallbackTimer)
  pendingVolumeFallbackTimer = setTimeout(() => {
    pendingVolumeFallbackTimer = null
    setWindowsVolumeDirect(level).catch(e => {
      console.error('[volume] direct CoreAudio fallback failed:', e.message)
    })
  }, delay)
}

function setWindowsVolume(level) {
  if (process.platform !== 'win32') return Promise.resolve()
  const nextLevel = clamp(Number(level) || 0, 0, 100)
  const scalar = nextLevel / 100
  broadcastVolume(nextLevel)
  const sent = sendDaemonCommand(`VOLUME:${scalar}`)
  if (!sent) {
    startWindowsMediaDaemon()
    scheduleWindowsVolumeFallback(nextLevel, 0)
  }
  return Promise.resolve()
}

async function getWindowsVolume() {
  if (process.platform !== 'win32') return lastKnownVolume
  try {
    return await readWindowsVolumeDirect()
  } catch (e) {
    console.error('[volume] direct read failed:', e.message)
    return lastKnownVolume
  }
}

ipcMain.handle('get-system-volume', async () => getWindowsVolume())

ipcMain.on('media-command', (_, command, value, source) => {
  if (process.platform === 'darwin') {
    let script = ''
    let target = (source || '').toLowerCase().includes('spotify') ? 'Spotify' : 'Music'
    if (command === 'playpause') {
      script = `tell application "${target}" to playpause`
    } else if (command === 'next') {
      script = `tell application "${target}" to next track`
    } else if (command === 'prev') {
      script = `tell application "${target}" to previous track`
    } else if (command === 'seek') {
      script = `tell application "${target}" to set player position to ${value}`
    } else if (command === 'volume') {
      script = `tell application "${target}" to set sound volume to ${value}`
    }
    if (script) {
      exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error(`macOS media-command ${command} error:`, err.message)
      })
    }
    return
  }

  if (command === 'volume') {
    setWindowsVolume(value)
    return
  }

  const nextVal = value !== null && value !== undefined ? String(value) : ''
  const nextSrc = source !== null && source !== undefined ? String(source) : ''
  const sent = sendDaemonCommand(`MEDIA:${command}:${nextVal}:${nextSrc}`)
  if (!sent) startWindowsMediaDaemon()
})

// ─── IPC: Settings sync ──────────────────────────────────────────────────────

ipcMain.on('update-settings', (event, settings) => {
  const next = sanitizeSettings(settings)
  saveSettings(next)
  notchState.position = next.notchPosition
  notchState.collapsedWidth = next.collapsedWidth
  notchState.expandedWidth = next.expandedWidth
  applyWindowEffects(next)
  applyNotchBounds(true)

  if (next.bingApiKey) {
    process.env.BING_API_KEY = next.bingApiKey
  }

  // Dynamically start/stop the agent daemon on setting changes
  if (next.betaModeEnabled) {
    if (!agentProcess) {
      startAgentDaemon()
    } else if (agentProcess.stdin && !agentProcess.stdin.destroyed) {
      try {
        agentProcess.stdin.write(JSON.stringify({ type: 'update_config', bingApiKey: next.bingApiKey || '' }) + '\n')
      } catch {}
    }
  } else if (agentProcess) {
    try {
      agentProcess.kill()
    } catch {}
    agentProcess = null
  }

  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('settings-updated', next)
    }
  })
})

ipcMain.handle('get-settings', () => loadSettings())

// ─── IPC: Clipboard ─────────────────────────────────────────────────────────

ipcMain.handle('read-clipboard', () => clipboard.readText())

ipcMain.handle('write-clipboard', (_, text) => {
  clipboard.writeText(String(text || ''))
  return true
})

// ─── IPC: Window management ──────────────────────────────────────────────────

ipcMain.on('expand-window', (_, stateName, opts) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (opts?.collapsedWidth) {
    notchState.collapsedWidth = clamp(Number(opts.collapsedWidth) || notchState.collapsedWidth, 240, 440)
  }
  if (opts?.expandedWidth) {
    notchState.expandedWidth = clamp(Number(opts.expandedWidth) || notchState.expandedWidth, 500, 800)
  }
  if (stateName === 'expanded') {
    notchState.state = 'expanded'
  } else if (stateName === 'collapsed') {
    notchState.state = 'collapsed'
  } else {
    notchState.state = 'merged'
  }
  applyNotchBounds(true)
})

ipcMain.on('set-window-size', (_, { width, height }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const display = screen.getPrimaryDisplay()
  const sw = display.workArea.width
  const notchY = display.workArea.y
  mainWindow.setBounds({ width, height, x: Math.floor(sw / 2 - width / 2), y: notchY }, true)
})

ipcMain.on('set-notch-position', (_, position, notchWidth) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  notchState.position = ['left', 'center', 'right'].includes(position) ? position : 'center'
  notchState.collapsedWidth = clamp(Number(notchWidth) || notchState.collapsedWidth, 240, 440)
  applyNotchBounds(true)
})

ipcMain.on('set-control-center', (_, isOpen) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  notchState.controlCenterOpen = !!isOpen
  // When CC opens, force expanded. When it closes,
  // leave state='expanded' — the React notch-bar will
  // collapse on its own mouse-leave after the overlay
  // dismisses (350 ms delay). This prevents a race
  // where the window snaps to collapsed while CC is
  // still animating out.
  if (isOpen) {
    notchState.state = 'expanded'
    // Make window focusable so sliders/inputs work in the Control Center
    try { mainWindow.setFocusable(true) } catch {}
  } else {
    try { mainWindow.setFocusable(notchState.state !== 'merged') } catch {}
  }
  applyNotchBounds(true)
})

ipcMain.on('set-control-center-docked', (_, docked) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  notchState.controlCenterDocked = !!docked
  applyNotchBounds(true)
})

ipcMain.on('set-panel-locked', (_, locked) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  notchState.panelLocked = !!locked
})

ipcMain.on('set-always-on-top', (_, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(value, 'screen-saver')
})

ipcMain.on('set-show-in-taskbar', (_, value) => {
  windowSettingsState.showInTaskbar = !!value
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setSkipTaskbar(!value)
})

ipcMain.on('set-window-effects', (_, effects) => {
  applyWindowEffects(effects)
})

ipcMain.on('set-launch-at-startup', (_, value) => {
  app.setLoginItemSettings({ openAtLogin: value, path: app.getPath('exe') })
})

ipcMain.on('quit-app', () => app.quit())

ipcMain.on('open-settings', (_, tab) => createSettingsWindow(tab))

ipcMain.on('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close()
})

// ─── IPC: System controls (Windows only) ────────────────────────────────────

ipcMain.on('set-brightness', (_, level) => {
  setSystemControl('brightness', level)
})

ipcMain.on('set-dnd', (_, enabled) => {
  setSystemControl('dnd', enabled)
})

ipcMain.on('set-nightlight', (_, enabled) => {
  setSystemControl('nightLight', enabled)
})

ipcMain.on('take-screenshot', () => {
  // Opens Windows Snipping Tool overlay
  if (process.platform === 'win32') {
    exec('start ms-screenclip:')
  }
})

// ─── Internet & Git Auto-Update System ─────────────────────────────────────

function checkInternetConnection() {
  return new Promise((resolve) => {
    dns.lookup('github.com', (err) => {
      if (!err) return resolve(true)
      dns.lookup('google.com', (err2) => {
        resolve(!err2)
      })
    })
  })
}

function checkGitUpdate() {
  return new Promise((resolve) => {
    const cwd = path.join(__dirname, '..')
    exec('git rev-parse --is-inside-work-tree', { cwd }, (err, stdout) => {
      if (err || stdout.trim() !== 'true') {
        return resolve({
          online: true,
          updateAvailable: false,
          currentCommit: 'v' + app.getVersion(),
          remoteCommit: 'v' + app.getVersion(),
          branch: 'main',
          commitsBehind: 0,
          message: 'Not running inside a git repository.',
        })
      }

      exec('git rev-parse --abbrev-ref HEAD', { cwd }, (err, branchOut) => {
        const branch = (branchOut || 'main').trim()
        exec('git rev-parse --short HEAD', { cwd }, (err, headOut) => {
          const currentCommit = (headOut || 'HEAD').trim()

          // Fetch from git remote
          exec('git fetch origin', { cwd, timeout: 15000 }, (fetchErr) => {
            if (fetchErr) {
              return resolve({
                online: false,
                updateAvailable: false,
                currentCommit,
                remoteCommit: currentCommit,
                branch,
                commitsBehind: 0,
                message: 'Failed to connect to Git remote repository.',
              })
            }

            const remoteRef = `origin/${branch}`
            exec(`git rev-parse --short ${remoteRef}`, { cwd }, (err, remoteOut) => {
              const remoteCommit = (remoteOut || currentCommit).trim()
              exec(`git rev-list --count HEAD..${remoteRef}`, { cwd }, (err, countOut) => {
                const commitsBehind = parseInt((countOut || '0').trim(), 10) || 0
                const updateAvailable = commitsBehind > 0 || (currentCommit !== remoteCommit && remoteCommit !== 'HEAD')

                resolve({
                  online: true,
                  updateAvailable,
                  currentCommit,
                  remoteCommit,
                  branch,
                  commitsBehind,
                  message: updateAvailable
                    ? `Update available! ${commitsBehind} new commit(s) on ${remoteRef}.`
                    : 'Edge Go is up to date.',
                })
              })
            })
          })
        })
      })
    })
  })
}

function performGitUpdate() {
  return new Promise((resolve) => {
    const cwd = path.join(__dirname, '..')
    exec('git pull --rebase origin main', { cwd, timeout: 45000 }, (err, stdout, stderr) => {
      const pullOutput = (stdout || '') + (stderr || '')
      if (err) {
        exec('git pull', { cwd, timeout: 45000 }, (err2, stdout2) => {
          if (err2) {
            return resolve({ ok: false, error: err2.message || 'Git pull failed' })
          }
          finishUpdate(stdout2)
        })
      } else {
        finishUpdate(pullOutput)
      }
    })

    function finishUpdate(output) {
      exec('npm run build', { cwd, timeout: 90000 }, () => {
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('agent-msg', {
              type: 'status_log',
              message: 'Git Auto-Update completed successfully. Reloading application...',
            })
            win.webContents.reloadIgnoringCache()
          }
        })
        resolve({ ok: true, output })
      })
    }
  })
}

ipcMain.handle('check-internet', async () => checkInternetConnection())
ipcMain.handle('check-git-update', async () => checkGitUpdate())
ipcMain.handle('perform-git-update', async () => performGitUpdate())

ipcMain.on('open-devtools', (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (owner && !owner.isDestroyed()) owner.webContents.openDevTools({ mode: 'detach' })
})

// ─── Agent Daemon & Pointing Overlay ───────────────────────────────────────
let agentProcess = null
let pointerOverlayWindow = null

function createPointerOverlayWindow() {
  if (pointerOverlayWindow) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.bounds

  pointerOverlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    show: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })

  pointerOverlayWindow.setIgnoreMouseEvents(true, { forward: true })

  if (isDev) {
    pointerOverlayWindow.loadURL('http://localhost:5173/?overlay=true').catch(err => console.error('Failed to load pointer overlay:', err))
  } else {
    pointerOverlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), { search: 'overlay=true' }).catch(err => console.error('Failed to load pointer overlay:', err))
  }

  pointerOverlayWindow.on('closed', () => {
    pointerOverlayWindow = null
  })
}

function getResolvedPath(filePath) {
  if (filePath.includes('app.asar')) {
    return filePath.replace('app.asar', 'app.asar.unpacked')
  }
  return filePath
}

function getWindowsPythonCandidates() {
  const candidates = ['python', 'python3', 'py']
  if (process.platform !== 'win32') return candidates

  const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '')
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const systemDrive = process.env.SystemDrive || 'C:'

  const searchDirs = []
  if (localAppData) {
    searchDirs.push(path.join(localAppData, 'Programs', 'Python'))
    searchDirs.push(path.join(localAppData, 'Microsoft', 'WindowsApps'))
  }
  if (programFiles) {
    searchDirs.push(path.join(programFiles, 'Python313'))
    searchDirs.push(path.join(programFiles, 'Python312'))
    searchDirs.push(path.join(programFiles, 'Python311'))
    searchDirs.push(path.join(programFiles, 'Python310'))
  }
  searchDirs.push(path.join(systemDrive, '\\Python313'))
  searchDirs.push(path.join(systemDrive, '\\Python312'))
  searchDirs.push(path.join(systemDrive, '\\Python311'))
  searchDirs.push(path.join(systemDrive, '\\Python310'))

  for (const dir of searchDirs) {
    try {
      if (fs.existsSync(dir)) {
        const stat = fs.statSync(dir)
        if (stat.isDirectory()) {
          const files = fs.readdirSync(dir)
          for (const f of files) {
            if (f.toLowerCase().startsWith('python') && fs.existsSync(path.join(dir, f, 'python.exe'))) {
              candidates.push(path.join(dir, f, 'python.exe'))
            }
          }
          if (fs.existsSync(path.join(dir, 'python.exe'))) {
            candidates.push(path.join(dir, 'python.exe'))
          }
        }
      }
    } catch {}
  }

  return Array.from(new Set(candidates))
}

function startAgentDaemon() {
  if (agentProcess) return

  const daemonPath = getResolvedPath(path.join(__dirname, 'agent_daemon.py'))
  
  // Try platform python commands with deep Windows auto-discovery fallback
  const pythonCmds = getWindowsPythonCandidates()
  let daemonStartedSuccessfully = false
  
  function trySpawn(index) {
    if (index >= pythonCmds.length) {
      console.error('[Agent Daemon] All python commands failed. Agent daemon cannot be started.')
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('agent-msg', {
            type: 'status',
            state: 'offline'
          })
          win.webContents.send('agent-msg', {
            type: 'error',
            message: 'Failed to start Python Agent daemon. Please ensure Python is installed and added to PATH.'
          })
        }
      })
      return
    }
    
    const cmd = pythonCmds[index]
    console.log(`[Agent Daemon] Trying to spawn with: ${cmd}`)
    
    // Broadcast connecting state to renderer
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('agent-msg', { type: 'status', state: 'connecting' })
      }
    })
    
    const envCopy = { ...process.env }
    const dotenvPaths = [
      path.join(__dirname, '../.env'),
      path.join(path.dirname(process.execPath), '.env'),
      path.join(app.getPath('userData'), '.env')
    ]
    for (const dotenvPath of dotenvPaths) {
      try {
        if (fs.existsSync(dotenvPath)) {
          const dotenvContent = fs.readFileSync(dotenvPath, 'utf-8')
          dotenvContent.split('\n').forEach(line => {
            const parts = line.split('=')
            if (parts.length >= 2) {
              const key = parts[0].trim()
              const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
              if (key) envCopy[key] = val
            }
          })
        }
      } catch (e) {
        console.warn(`[Agent Daemon] Error loading .env from ${dotenvPath}:`, e.message)
      }
    }

    envCopy.PYTHONUNBUFFERED = '1'
    envCopy.PYTHONIOENCODING = 'utf-8'
    envCopy.EDGE_GO_SETTINGS_PATH = getSettingsPath()
    if (savedSettings.bingApiKey) {
      envCopy.BING_API_KEY = savedSettings.bingApiKey
    }
    
    let spawnedProcess;
    try {
      spawnedProcess = spawn(cmd, ['-u', daemonPath], {
        env: envCopy
      })
    } catch (err) {
      console.warn(`[Agent Daemon] Spawn error with ${cmd}:`, err.message)
      trySpawn(index + 1)
      return
    }

    let buffer = ''
    spawnedProcess.stdout.on('data', (data) => {
      buffer += data.toString('utf-8')
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const payload = JSON.parse(trimmed)
          if (payload.type === 'ready') {
            daemonStartedSuccessfully = true
          }
          if (payload.type === 'wake') {
            if (mainWindow && !mainWindow.isDestroyed()) {
              notchState.state = 'expanded'
              showMainWindow()
              applyNotchBounds(true)
              mainWindow.webContents.send('agent-msg', payload)
            }
          } else if (payload.type === 'pointer_animation') {
            if (pointerOverlayWindow && !pointerOverlayWindow.isDestroyed()) {
              const cursor = screen.getCursorScreenPoint()
              payload.startX = cursor.x
              payload.startY = cursor.y
              pointerOverlayWindow.show()
              pointerOverlayWindow.webContents.send('agent-msg', payload)
              setTimeout(() => {
                if (pointerOverlayWindow && !pointerOverlayWindow.isDestroyed()) {
                  pointerOverlayWindow.hide()
                }
              }, 3000)
            }
          } else {
            BrowserWindow.getAllWindows().forEach(win => {
              if (!win.isDestroyed()) {
                win.webContents.send('agent-msg', payload)
              }
            })
          }
        } catch (e) {
          console.warn('[Agent stdout JSON error]:', trimmed, e.message)
        }
      }
    })

    spawnedProcess.stderr.on('data', (data) => {
      const msg = data.toString('utf-8').trim()
      if (msg) console.warn('[Agent daemon stderr]', msg)
    })

    spawnedProcess.on('error', (err) => {
      console.warn(`[Agent Daemon] Process error with ${cmd}:`, err.message)
      if (agentProcess === spawnedProcess) {
        agentProcess = null
      }
      trySpawn(index + 1)
    })

    spawnedProcess.on('close', (code) => {
      console.log(`[Agent daemon] exited (code=${code})`)
      if (agentProcess === spawnedProcess) {
        agentProcess = null
        if (!daemonStartedSuccessfully) {
          console.warn(`[Agent Daemon] Command '${cmd}' failed during startup (code=${code}). Trying next command...`)
          trySpawn(index + 1)
        } else {
          BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
              win.webContents.send('agent-msg', { type: 'status', state: 'offline' })
            }
          })
          if (app.isReady() && !app.isQuitting) {
            console.log('[Agent daemon] Restarting in 5s…')
            setTimeout(startAgentDaemon, 5000)
          }
        }
      }
    })

    agentProcess = spawnedProcess
  }

  trySpawn(0)
}

ipcMain.on('restart-agent-daemon', () => {
  if (agentProcess) {
    try { agentProcess.kill() } catch {}
    agentProcess = null
  }
  startAgentDaemon()
})

ipcMain.on('send-agent-prompt', (_, text) => {
  if (agentProcess && agentProcess.stdin && !agentProcess.stdin.destroyed) {
    try {
      const payload = JSON.stringify({ type: 'prompt', text })
      agentProcess.stdin.write(payload + '\n')
    } catch (e) {
      console.error('[Agent daemon] Stdin write error:', e.message)
    }
  } else {
    startAgentDaemon()
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('agent-msg', {
          type: 'error',
          message: 'Agent daemon is starting up. Please wait and try again.'
        })
      }
    })
  }
})

ipcMain.on('set-wake-word', (_, enabled) => {
  if (agentProcess && agentProcess.stdin && !agentProcess.stdin.destroyed) {
    try {
      const payload = JSON.stringify({ type: 'set_wake_word', enabled })
      agentProcess.stdin.write(payload + '\n')
    } catch (e) {
      console.error('[Agent daemon] Stdin write error:', e.message)
    }
  }
})

ipcMain.on('set-voice-listener-suspended', (_, suspended) => {
  if (agentProcess && agentProcess.stdin && !agentProcess.stdin.destroyed) {
    try {
      const payload = JSON.stringify({ type: 'suspend_voice_listener', suspended })
      agentProcess.stdin.write(payload + '\n')
    } catch (e) {
      console.error('[Agent daemon] Stdin write error:', e.message)
    }
  }
})

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform !== 'win32') {
    console.warn('====================================================================');
    console.warn('WARNING: Edge Go is designed and built exclusively for Windows.');
    console.warn('Running on non-Windows platforms is for UI development/testing only.');
    console.warn('====================================================================');
  }

  startWindowsMediaDaemon()   // no-op on non-Windows
  if (savedSettings.betaModeEnabled) {
    startAgentDaemon()
  }
  createWindow()
  createPointerOverlayWindow()

  try {
    createTray()
  } catch (e) {
    console.warn('Tray creation skipped:', e.message)
  }

  // Win+Alt+E: toggle HUD visibility
  globalShortcut.register('Super+Alt+E', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else showMainWindow()
  })

  // Win+Alt+S: open settings
  globalShortcut.register('Super+Alt+S', () => {
    createSettingsWindow()
  })

  globalShortcut.register('Super+Alt+C', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow()
      mainWindow.webContents.send('open-control-center')
    }
  })

  globalShortcut.register('Super+Alt+V', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow()
      mainWindow.webContents.send('open-clipboard')
    }
  })
})

// Keep app alive in tray even when all windows are closed
app.on('window-all-closed', () => {
  // Do NOT quit — app lives in the system tray
})

app.on('will-quit', () => {
  app.isQuitting = true
  if (winMediaProcess) {
    try {
      winMediaProcess.kill()
    } catch {}
  }
  if (agentProcess) {
    try {
      agentProcess.kill()
    } catch {}
  }
  globalShortcut.unregisterAll()
})
