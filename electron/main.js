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
const { exec } = require('child_process')

const isDev = !app.isPackaged

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
    mainWindow.show()
    mainWindow.focus()
  }
})


let mainWindow
let settingsWindow
let tray
let winMediaProcess = null
let lastWindowsMediaData = []
let boundsTimeout = null
// Tracks the notch's saved position so restores are correct
const notchState = {
  position: 'center',
  collapsedWidth: 300,
  expandedWidth: 620,
  state: 'merged',
  controlCenterOpen: false,
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
  alwaysOnTop: true,
  showInTaskbar: false,
  enableWindowShadow: true,
}

const NOTCH_MERGED_HEIGHT = 16
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
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
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
  const notchY = display.workArea.y

  if (boundsTimeout) {
    clearTimeout(boundsTimeout)
    boundsTimeout = null
  }

  if (notchState.controlCenterOpen) {
    mainWindow.setBounds({ width: sw, height: sh, x: 0, y: notchY }, false)
    mainWindow.setIgnoreMouseEvents(false)
    return
  }

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
  const isExpanding = (width > currentBounds.width || height > currentBounds.height)

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
  const width = display.workArea.width
  const notchY = display.workArea.y

  mainWindow = new BrowserWindow({
    width: 140,
    height: NOTCH_MERGED_HEIGHT,
    x: getNotchX(width, 140),
    y: notchY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    thickFrame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.setAlwaysOnTop(windowSettingsState.alwaysOnTop, 'screen-saver')
  })

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed() && windowSettingsState.alwaysOnTop) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver')
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
    settingsWindow.loadURL(`http://localhost:5173/#settings?tab=${tab}`)
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `settings?tab=${tab}` })
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
          else mainWindow.show()
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
    else mainWindow.show()
    tray.setContextMenu(buildMenu())
  })
}

// ─── IPC: Battery ─────────────────────────────────────────────────────────

ipcMain.handle('get-battery', async () => {
  try {
    const out = await runPowerShell(`
$battery = Get-CimInstance Win32_Battery | Select-Object -First 1
if ($battery) {
  [PSCustomObject]@{
    level = [int]$battery.EstimatedChargeRemaining
    charging = ($battery.BatteryStatus -eq 2 -or $battery.BatteryStatus -eq 6 -or $battery.BatteryStatus -eq 7 -or $battery.BatteryStatus -eq 8 -or $battery.BatteryStatus -eq 9)
    available = $true
  } | ConvertTo-Json -Compress
} else {
  [PSCustomObject]@{ level = 100; charging = $false; available = $false } | ConvertTo-Json -Compress
}
`)
    return JSON.parse(out.trim())
  } catch (e) {
    console.error('get-battery error:', e.message)
    return { level: 100, charging: false, available: false }
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

async function getWindowsSystemState() {
  if (process.platform !== 'win32') return { ...systemControlState }

  try {
    const out = await runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
$brightness = (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness
$toast = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -ErrorAction SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED
$wifiAdapter = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match 'Wi-Fi|Wireless|WLAN' -or $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN'
} | Select-Object -First 1
$bluetoothDevice = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object {
  $_.InstanceId -notmatch '^BTHENUM' -and $_.FriendlyName -match 'Bluetooth'
} | Select-Object -First 1
[PSCustomObject]@{
  brightness = if ($brightness -ne $null) { [int]$brightness } else { $null }
  dnd = ($toast -eq 0)
  wifi = if ($wifiAdapter) { $wifiAdapter.Status -ne 'Disabled' } else { $null }
  bluetooth = if ($bluetoothDevice) { $bluetoothDevice.Status -eq 'OK' } else { $null }
} | ConvertTo-Json -Compress
`)
    const parsed = JSON.parse(out.trim())
    return {
      ...systemControlState,
      brightness: parsed.brightness ?? systemControlState.brightness,
      dnd: typeof parsed.dnd === 'boolean' ? parsed.dnd : systemControlState.dnd,
      wifi: typeof parsed.wifi === 'boolean' ? parsed.wifi : systemControlState.wifi,
      bluetooth: typeof parsed.bluetooth === 'boolean' ? parsed.bluetooth : systemControlState.bluetooth,
    }
  } catch (e) {
    console.error('get-system-state error:', e.message)
    return { ...systemControlState }
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
    script = `(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods).WmiSetBrightness(1,${numberValue}) | Out-Null`
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
  } else if (control === 'wifi') {
    script = `
$adapter = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match 'Wi-Fi|Wireless|WLAN' -or $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN'
} | Select-Object -First 1
if (-not $adapter) { throw 'No Wi-Fi adapter found' }
if (${boolValue}) {
  Enable-NetAdapter -Name $adapter.Name -Confirm:$false
} else {
  Disable-NetAdapter -Name $adapter.Name -Confirm:$false
}
`
  } else if (control === 'bluetooth') {
    script = `
$device = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object {
  $_.InstanceId -notmatch '^BTHENUM' -and $_.FriendlyName -match 'Bluetooth'
} | Select-Object -First 1
if (-not $device) { throw 'No Bluetooth adapter found' }
if (${boolValue}) {
  Enable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false
} else {
  Disable-PnpDevice -InstanceId $device.InstanceId -Confirm:$false
}
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
    await runPowerShell(script)
    systemControlState[control] = control === 'brightness' ? numberValue : !!value
    return { ok: true, state: { ...systemControlState } }
  } catch (e) {
    console.error(`set-system-control ${control} error:`, e.message)
    return { ok: false, error: e.message, state: { ...systemControlState } }
  }
}

ipcMain.handle('get-system-state', async () => getWindowsSystemState())

ipcMain.handle('set-system-control', async (_, control, value) => setSystemControl(control, value))

// ─── IPC: Media Info (cross-platform) ──────────────────────────────────────

// Shared store — whichever platform daemon fills this, the renderer reads it.
let lastMediaData = []

ipcMain.handle('get-media-info', async () => {
  return lastMediaData
})

// Push updates to renderer whenever media changes
function pushMediaUpdate(data) {
  lastMediaData = data
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('media-update', data)
  }
}

// ─── macOS media bridge (osascript) ─────────────────────────────────────────

let macMediaTimer = null
let lastMacMediaJson = ''

function startMacMediaDaemon() {
  if (process.platform !== 'darwin') return

  const script = `
tell application "System Events"
  set runningApps to (name of every application process)
end tell

set mediaList to {}

-- Spotify
if "Spotify" is in runningApps then
  try
    tell application "Spotify"
      if player state is not stopped then
        set trackName to name of current track
        set artistName to artist of current track
        set albumName to album of current track
        set trackDuration to (duration of current track) / 1000
        set trackPosition to player position
        set isPlayingNow to (player state is playing)
        set mediaList to mediaList & {{title:trackName, artist:artistName, album:albumName, source:"Spotify", sourceAppId:"com.spotify.client", isPlaying:isPlayingNow, duration:trackDuration, position:trackPosition, isCurrent:true}}
      end if
    end tell
  end try
end if

-- Music.app / Apple Music
if "Music" is in runningApps then
  try
    tell application "Music"
      if player state is not stopped then
        set trackName to name of current track
        set artistName to artist of current track
        set albumName to album of current track
        set trackDuration to duration of current track
        set trackPosition to player position
        set isPlayingNow to (player state is playing)
        set mediaList to mediaList & {{title:trackName, artist:artistName, album:albumName, source:"Apple Music", sourceAppId:"com.apple.Music", isPlaying:isPlayingNow, duration:trackDuration, position:trackPosition, isCurrent:(length of mediaList = 0)}}
      end if
    end tell
  end try
end if

set jsonOut to "["
repeat with i from 1 to length of mediaList
  set m to item i of mediaList
  set isLast to (i = length of mediaList)
  set jsonOut to jsonOut & "{\"title\":\"" & title of m & "\",\"artist\":\"" & artist of m & "\",\"album\":\"" & album of m & "\",\"source\":\"" & source of m & "\",\"sourceAppId\":\"" & sourceAppId of m & "\",\"isPlaying\":" & isPlaying of m & ",\"duration\":" & duration of m & ",\"position\":" & position of m & ",\"isCurrent\":" & isCurrent of m & "}"
  if not isLast then set jsonOut to jsonOut & ","
end repeat
set jsonOut to jsonOut & "]"
return jsonOut
`

  const poll = () => {
    exec(`osascript -e '${script.replace(/'/g, "'\''")}'`, { timeout: 4000 }, (err, stdout) => {
      if (err) {
        // osascript failed — no media apps open, push empty
        if (lastMacMediaJson !== '[]') {
          lastMacMediaJson = '[]'
          pushMediaUpdate([])
        }
        return
      }
      const raw = (stdout || '').trim()
      if (!raw || raw === lastMacMediaJson) return
      lastMacMediaJson = raw
      try {
        const parsed = JSON.parse(raw)
        const sessions = Array.isArray(parsed) ? parsed.map(s => ({
          title: s.title || 'Unknown',
          artist: s.artist || '',
          album: s.album || '',
          albumArt: null,
          duration: Number(s.duration) || 0,
          position: Number(s.position) || 0,
          isPlaying: s.isPlaying === true || s.isPlaying === 'true',
          volume: 50,
          source: s.source || 'Media',
          sourceAppId: s.sourceAppId || '',
          isCurrent: s.isCurrent === true || s.isCurrent === 'true',
        })) : []
        pushMediaUpdate(sessions)
      } catch (e) {
        console.warn('[Mac media] JSON parse error:', e.message, '| raw:', raw)
      }
    })
  }

  poll()
  macMediaTimer = setInterval(poll, 2000)
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
    console.warn('Windows media daemon failed repeatedly. Disabling SMTC media queries.')
    return
  }

  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
  }
  $smgr = Await([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  while ($true) {
    try {
      $sessions = $smgr.GetSessions()
      $current = $smgr.GetCurrentSession()
      $currentId = if ($current) { [string]$current.SourceAppUserModelId } else { '' }
      $results = [System.Collections.Generic.List[hashtable]]::new()
      foreach ($s in $sessions) {
        try {
          $props = Await($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.MediaProperties])
          $info  = $s.GetPlaybackInfo()
          $tl    = $s.GetTimelineProperties()
          $src   = [string]$s.SourceAppUserModelId
          $srcLower = $src.ToLowerInvariant()
          $label = switch -Wildcard ($srcLower) {
            '*spotify*'       { 'Spotify' }
            '*chrome*'        { 'Chrome' }
            '*msedge*'        { 'Edge' }
            '*firefox*'       { 'Firefox' }
            '*vlc*'           { 'VLC' }
            '*zune*'          { 'Groove Music' }
            '*groove*'        { 'Groove Music' }
            '*wmplayer*'      { 'Windows Media Player' }
            '*media.player*'  { 'Windows Media' }
            '*music*'         { 'Windows Media' }
            default           { if ($src) { $src } else { 'Media' } }
          }
          $albumArtStr = $null
          if ($src -eq $currentId -and $props.Thumbnail) {
            try {
              $stream = Await($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
              if ($stream) {
                $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
                $bytes = New-Object byte[] $stream.Size
                $loadTask = $reader.LoadAsync($stream.Size)
                Await $loadTask ([uint32]) | Out-Null
                $reader.ReadBytes($bytes)
                $base64 = [Convert]::ToBase64String($bytes)
                $contentType = $stream.ContentType
                if (-not $contentType) { $contentType = "image/jpeg" }
                $albumArtStr = "data:" + $contentType + ";base64," + $base64
                $reader.Dispose()
                $stream.Dispose()
              }
  Add-Type -TypeDefinition $csCode \`
    -ReferencedAssemblies 'System.Runtime.WindowsRuntime','Windows.Media.Control','Windows.Storage.Streams' \`
    -Language CSharp -IgnoreWarnings 2>$null
  $smtcOk = $true
} catch {
  Write-Error "SMTC_INIT_FAIL:$($_.Exception.Message)"
  $smtcOk = $false
}

# ── Spotify window-title fallback ──────────────────────────────────────────
function Get-SpotifyTitle {
  $proc = Get-Process Spotify -ErrorAction SilentlyContinue |
          Where-Object { $_.MainWindowTitle -and
                         $_.MainWindowTitle -notmatch '^Spotify( Premium)?$' } |
          Select-Object -First 1
  if (-not $proc) { return $null }
  $t = $proc.MainWindowTitle
  if ($t -match '^(.+?) - (.+)$') {
    return @{ title=$Matches[2].Trim(); artist=$Matches[1].Trim(); album='';
              albumArt=''; isPlaying=$true; position=0; duration=0;
              source='Spotify'; sourceAppId='com.spotify.client'; isCurrent=$true }
  }
  return $null
}

# ── Serialise hashtable → JSON ─────────────────────────────────────────────
function To-Json($h) {
  $f = @()
  foreach ($k in $h.Keys) {
    $v = $h[$k]
    if ($v -is [bool])   { $f += '"'+$k+'":'+$v.ToString().ToLower() }
    elseif ($v -is [System.ValueType]) { $f += '"'+$k+'":'+$v }
    else { $e = ([string]$v) -replace '\\','\\\\' -replace '"','\\"' -replace "[\r\n]",' '
           $f += '"'+$k+'":"'+$e+'"' }
  }
  '{' + ($f -join ',') + '}'
}

# ── Main poll loop ──────────────────────────────────────────────────────────
while ($true) {
  $out = '[]'
  try {
    if ($smtcOk) {
      $list = [SmtcBridge]::GetSessions()
      if ($list -and $list.Count -gt 0) {
        $parts = foreach ($s in $list) { To-Json $s }
        $out = '[' + ($parts -join ',') + ']'
      } else {
        $sp = Get-SpotifyTitle
        if ($sp) { $out = '[' + (To-Json $sp) + ']' }
      }
    } else {
      $sp = Get-SpotifyTitle
      if ($sp) { $out = '[' + (To-Json $sp) + ']' }
    }
  } catch { Write-Error "POLL_ERR:$($_.Exception.Message)" }
  Write-Output "MEDIA_JSON:$out"
  Start-Sleep -Milliseconds 1500
}
`

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
  const { spawn } = require('child_process')
  winMediaProcess = spawn('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-EncodedCommand',
    encoded,
  ], { windowsHide: true })

  let buffer = ''
  winMediaProcess.stdout.on('data', (data) => {
    buffer += data.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('MEDIA_JSON:')) continue
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
          volume:      50,
          source:      s.source      || 'Media',
          sourceAppId: s.sourceAppId || '',
          isCurrent:   s.isCurrent === true || s.isCurrent === 'true',
        })) : []
        pushMediaUpdate(sessions)
      } catch (e) {
        console.error('[SMTC] JSON parse error:', e.message)
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

// ─── Spotify window-title fallback poller (Node-side, no PowerShell) ─────────
// Activated only if the SMTC daemon fails > 5 times. Reads Spotify's window
// title from tasklist — the title is "Artist – Song" while something plays.
let spotifyFallbackTimer = null
function startSpotifyFallbackPoller() {
  if (spotifyFallbackTimer || process.platform !== 'win32') return
  const poll = () => {
    exec('tasklist /FI "IMAGENAME eq Spotify.exe" /FO CSV /NH /V', { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) { pushMediaUpdate([]); return }
      for (const line of stdout.split('\n')) {
        const cols = line.split('","')
        if (cols.length < 9) continue
        const title = (cols[8] || '').replace(/"/g, '').trim()
        if (!title || /^Spotify( Premium)?$/.test(title)) continue
        const m = title.match(/^(.+?) - (.+)$/)
        if (!m) continue
        pushMediaUpdate([{
          title: m[2].trim(), artist: m[1].trim(), album: '',
          albumArt: null, duration: 0, position: 0, isPlaying: true,
          volume: 50, source: 'Spotify', sourceAppId: 'com.spotify.client', isCurrent: true,
        }])
        return
      }
      pushMediaUpdate([])
    })
  }
  poll()
  spotifyFallbackTimer = setInterval(poll, 2000)
}

// ─── IPC: Media Commands (Windows SMTC) ─────────────────────────────────────

function setWindowsVolume(level) {
  const scalar = clamp(Number(level) || 0, 0, 100) / 100
  const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

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
    public static void Set(float level) {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      IAudioEndpointVolume endpoint;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
      var eventContext = Guid.Empty;
      Marshal.ThrowExceptionForHR(endpoint.SetMasterVolumeLevelScalar(level, eventContext));
      Marshal.ThrowExceptionForHR(endpoint.SetMute(level <= 0.001f, eventContext));
    }
  }
}
'@
[EdgeGoAudio.Volume]::Set(${scalar})
`
  return runPowerShell(psScript)
}

ipcMain.on('media-command', (_, command, value, source) => {
  if (command === 'volume') {
    setWindowsVolume(value).catch(e => {
      console.error('volume-command error:', e.message)
    })
    return
  }

  let method = ''
  if (command === 'playpause') method = 'TryTogglePlayPauseAsync'
  else if (command === 'next')  method = 'TrySkipNextAsync'
  else if (command === 'prev')  method = 'TrySkipPreviousAsync'
  else if (command === 'seek')  method = 'TryChangePlaybackPositionAsync'

  if (!method) return

  const safeSource = (source || '').replace(/'/g, "''")
  const seekTicks = command === 'seek'
    ? Math.round(clamp(Number(value) || 0, 0, 86400) * 10000000)
    : 0
  const action = command === 'seek'
    ? `[void](AwaitResult ($session.TryChangePlaybackPositionAsync(${seekTicks})) ([bool]))`
    : `[void](AwaitResult ($session.${method}()) ([bool]))`
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function AwaitResult($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
function Get-FriendlySource($id) {
  switch -Wildcard ($id.ToLowerInvariant()) {
    '*spotify*'       { return 'Spotify' }
    '*chrome*'        { return 'Chrome' }
    '*msedge*'        { return 'Edge' }
    '*firefox*'       { return 'Firefox' }
    '*vlc*'           { return 'VLC' }
    '*zune*'          { return 'Groove Music' }
    '*groove*'        { return 'Groove Music' }
    '*wmplayer*'      { return 'Windows Media Player' }
    '*media.player*'  { return 'Windows Media' }
    '*music*'         { return 'Windows Media' }
    default           { return $id }
  }
}
function Invoke-EdgeGoMediaCommand($session) {
  if (-not $session) { return $false }
  try {
    ${action}
    return $true
  } catch {
    return $false
  }
}
$smgr = AwaitResult([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = $smgr.GetSessions()
$target = '${safeSource}'.ToLower()
$matched = $false
foreach ($s in $sessions) {
  $id = ([string]$s.SourceAppUserModelId).ToLowerInvariant()
  $label = (Get-FriendlySource $id).ToLowerInvariant()
  if ($target -and ($id.Contains($target) -or $label.Contains($target))) {
    $matched = Invoke-EdgeGoMediaCommand $s
    if ($matched) {
      break
    }
  }
}
if (-not $matched) {
  $cur = $smgr.GetCurrentSession()
  if ($cur) {
    $matched = Invoke-EdgeGoMediaCommand $cur
  }
}
if (-not $matched) {
  foreach ($s in $sessions) {
    if (Invoke-EdgeGoMediaCommand $s) {
    $matched = $true
    break
    }
  }
}
`
  runPowerShell(psScript).catch(e => {
    console.error('media-command error:', e.message)
  })
})

// ─── IPC: Settings sync ──────────────────────────────────────────────────────

ipcMain.on('update-settings', (event, settings) => {
  const next = sanitizeSettings(settings)
  notchState.position = next.notchPosition
  notchState.collapsedWidth = next.collapsedWidth
  notchState.expandedWidth = next.expandedWidth
  applyWindowEffects(next)
  applyNotchBounds(true)

  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('settings-updated', next)
    }
  })
})

ipcMain.handle('get-settings', () => null)

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
  if (isOpen) notchState.state = 'expanded'
  applyNotchBounds(true)
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

ipcMain.on('open-devtools', (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (owner && !owner.isDestroyed()) owner.webContents.openDevTools({ mode: 'detach' })
})

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startWindowsMediaDaemon()   // no-op on non-Windows
  startMacMediaDaemon()       // no-op on non-macOS
  createWindow()

  try {
    createTray()
  } catch (e) {
    console.warn('Tray creation skipped:', e.message)
  }

  // Win+Alt+E: toggle HUD visibility
  globalShortcut.register('Super+Alt+E', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else mainWindow.show()
  })

  // Win+Alt+S: open settings
  globalShortcut.register('Super+Alt+S', () => {
    createSettingsWindow()
  })

  globalShortcut.register('Super+Alt+C', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.webContents.send('open-control-center')
    }
  })

  globalShortcut.register('Super+Alt+V', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
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
  globalShortcut.unregisterAll()
})
