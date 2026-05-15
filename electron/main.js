const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  screen,
  nativeImage,
  globalShortcut,
} = require('electron')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')

const isDev = !app.isPackaged

let mainWindow
let settingsWindow
let tray
let isExpanded = false

// Tracks the notch's saved position so restores are correct
const notchState = { position: 'center', width: 320 }

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Run a PowerShell command safely using -EncodedCommand to avoid
 * escaping issues with quotes inside the script.
 */
function runPowerShell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

// ─── Window creation ────────────────────────────────────────────────────────

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: 320,
    height: 44,
    x: Math.floor(width / 2 - 160),
    y: 0,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
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

  // Show window only when content is ready to avoid blank flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Re-assert always-on-top after show
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
  })

  // Keep always on top on Windows
  mainWindow.setAlwaysOnTop(true, 'pop-up-menu')

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
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
  return new Promise((resolve) => {
    exec(
      'wmic path win32_battery get EstimatedChargeRemaining,BatteryStatus /format:value',
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve({ level: 100, charging: false, available: false })
          return
        }
        const levelMatch = stdout.match(/EstimatedChargeRemaining=(\d+)/)
        const statusMatch = stdout.match(/BatteryStatus=(\d+)/)
        if (!levelMatch) {
          resolve({ level: 100, charging: false, available: false })
          return
        }
        resolve({
          level: parseInt(levelMatch[1]),
          // BatteryStatus=2 means "Charging", 1 means "On Battery"
          charging: statusMatch ? parseInt(statusMatch[1]) === 2 : false,
          available: true,
        })
      }
    )
  })
})

// ─── IPC: System Info ─────────────────────────────────────────────────────

ipcMain.handle('get-system-info', () => ({
  platform: 'win32',
  hostname: os.hostname(),
  arch: os.arch(),
  version: app.getVersion(),
}))

ipcMain.handle('get-system-state', async () => {
  const state = { dnd: false, nightLight: false, brightness: 72 }

  try {
    // Get brightness
    const brightnessOut = await runPowerShell(
      `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness`
    ).catch(() => '')
    if (brightnessOut) state.brightness = parseInt(brightnessOut.trim()) || 72

    // Get Focus Assist (DND) — 0x0 means notifications disabled = DND on
    const dndOut = await runPowerShell(
      `(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -ErrorAction SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED`
    ).catch(() => '')
    if (dndOut && dndOut.trim() === '0') state.dnd = true
  } catch (e) {
    console.error('get-system-state error:', e.message)
  }

  return state
})

// ─── IPC: Media Info (Windows SMTC) ─────────────────────────────────────────

ipcMain.handle('get-media-info', async () => {
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
  $sessions = $smgr.GetSessions()
  $results = [System.Collections.Generic.List[hashtable]]::new()
  foreach ($s in $sessions) {
    try {
      $props = Await($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.MediaProperties])
      $info  = $s.GetPlaybackInfo()
      $tl    = $s.GetTimelineProperties()
      $src   = $s.SourceAppUserModelId
      $label = switch -Wildcard ($src.ToLower()) {
        '*spotify*'  { 'Spotify' }
        '*chrome*'   { 'Chrome' }
        '*msedge*'   { 'Edge' }
        '*firefox*'  { 'Firefox' }
        '*vlc*'      { 'VLC' }
        '*groove*'   { 'Groove Music' }
        '*music*'    { 'Windows Media' }
        default      { 'Media' }
      }
      $results.Add(@{
        title     = if ($props.Title)       { $props.Title }       else { 'Unknown' }
        artist    = if ($props.Artist)      { $props.Artist }      else { '' }
        album     = if ($props.AlbumTitle)  { $props.AlbumTitle }  else { '' }
        isPlaying = ($info.PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing)
        position  = if ($tl) { try { [math]::Round($tl.Position.TotalSeconds, 1) } catch { 0 } } else { 0 }
        duration  = if ($tl) { try { [math]::Round($tl.EndTime.TotalSeconds, 1) } catch { 0 } } else { 0 }
        source    = $label
      })
    } catch { }
  }
  if ($results.Count -gt 0) {
    $results | ConvertTo-Json -Compress
  } else { '[]' }
} catch { '[]' }
`
  try {
    const out = await runPowerShell(psScript)
    if (!out || !out.trim() || out.trim() === '[]') return []
    let data = JSON.parse(out.trim())
    if (!Array.isArray(data)) data = [data]
    return data.map(s => ({
      title: s.title || 'Unknown Title',
      artist: s.artist || '',
      album: s.album || '',
      duration: Number(s.duration) || 0,
      position: Number(s.position) || 0,
      isPlaying: !!s.isPlaying,
      volume: 50,
      source: s.source || 'Media',
      albumArt: null,
    }))
  } catch (e) {
    console.error('get-media-info error:', e.message)
    return []
  }
})

// ─── IPC: Media Commands (Windows SMTC) ─────────────────────────────────────

ipcMain.on('media-command', (_, command, value, source) => {
  let method = ''
  if (command === 'playpause') method = 'TryTogglePlayPauseAsync'
  else if (command === 'next')  method = 'TrySkipNextAsync'
  else if (command === 'prev')  method = 'TrySkipPreviousAsync'

  if (!method) return

  const safeSource = (source || '').replace(/'/g, "''")
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
function AwaitAction($WinRtTask) {
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethod('AsTask', [Type[]]@([Windows.Foundation.IAsyncAction]))
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
}
$smgr = Await([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = $smgr.GetSessions()
$target = '${safeSource}'.ToLower()
$matched = $false
foreach ($s in $sessions) {
  $id = $s.SourceAppUserModelId.ToLower()
  if ($target -and $id -like "*$target*") {
    AwaitAction($s.${method}())
    $matched = $true
    break
  }
}
if (-not $matched) {
  $cur = $smgr.GetCurrentSession()
  if ($cur) { AwaitAction($cur.${method}()) }
}
`
  runPowerShell(psScript).catch(e => console.error('media-command error:', e.message))
})

// ─── IPC: Settings sync ──────────────────────────────────────────────────────

ipcMain.on('update-settings', (_, settings) => {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send('settings-updated', settings)
  })
})

ipcMain.handle('get-settings', () => null)

// ─── IPC: Window management ──────────────────────────────────────────────────

function getNotchX(sw) {
  const w = notchState.width || 320
  switch (notchState.position) {
    case 'left':  return 16
    case 'right': return sw - w - 16
    default:      return Math.floor(sw / 2 - w / 2)
  }
}

ipcMain.on('expand-window', (_, expanded) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  const x = getNotchX(sw)
  if (expanded) {
    mainWindow.setBounds({ width: 680, height: 200, x: Math.max(0, Math.min(x - 180, sw - 680)), y: 0 }, true)
  } else {
    mainWindow.setBounds({ width: notchState.width || 320, height: 44, x, y: 0 }, true)
  }
})

ipcMain.on('set-window-size', (_, { width, height }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  mainWindow.setBounds({ width, height, x: Math.floor(sw / 2 - width / 2), y: 0 }, true)
})

ipcMain.on('set-notch-position', (_, position, notchWidth) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  notchState.position = position || 'center'
  notchState.width = notchWidth || 320
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  const x = getNotchX(sw)
  const currentBounds = mainWindow.getBounds()
  mainWindow.setBounds({ ...currentBounds, x, width: notchState.width }, true)
})

ipcMain.on('set-control-center', (_, isOpen) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  if (isOpen) {
    mainWindow.setBounds({ width: sw, height: sh, x: 0, y: 0 }, true)
    mainWindow.setIgnoreMouseEvents(false)
  } else {
    const x = getNotchX(sw)
    mainWindow.setBounds({ width: notchState.width || 320, height: 44, x, y: 0 }, true)
  }
})

ipcMain.on('set-always-on-top', (_, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(value, 'pop-up-menu')
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
  runPowerShell(
    `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${Math.max(0, Math.min(100, level))})`
  ).catch(e => console.error('set-brightness error:', e.message))
})

ipcMain.on('set-dnd', (_, enabled) => {
  // Toggle Windows Focus Assist via registry
  // 0 = DND on (notifications blocked), 1 = DND off
  const val = enabled ? 0 : 1
  runPowerShell(
    `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' -Value ${val} -Force`
  ).catch(e => console.error('set-dnd error:', e.message))
})

ipcMain.on('set-nightlight', (_, enabled) => {
  // Toggle Windows Night Light via registry
  const psScript = `
$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultNetworkCloudStore\\Data\\Microsoft.Settings.Displays.BlueLightReduction.Setting'
try {
  $data = (Get-ItemProperty -Path $path -ErrorAction Stop).Data
  if ($data -and $data.Length -gt 24) {
    $data[24] = if (${enabled ? '$true' : '$false'}) { 0x15 } else { 0x10 }
    Set-ItemProperty -Path $path -Name 'Data' -Value $data
  }
} catch {}
`
  runPowerShell(psScript).catch(e => console.error('set-nightlight error:', e.message))
})

ipcMain.on('take-screenshot', () => {
  // Opens Windows Snipping Tool overlay
  exec('start ms-screenclip:')
})

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
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
})

// Keep app alive in tray even when all windows are closed
app.on('window-all-closed', () => {
  // Do NOT quit — app lives in the system tray
})
