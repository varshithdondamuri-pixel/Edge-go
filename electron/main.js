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

// ─── Window creation ────────────────────────────────────────────────────────

function createWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: 320,
    height: 40,
    x: Math.floor(width / 2 - 160),
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    roundedCorners: false,
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
  })

  // Keep always on top aggressively
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1)
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
    transparent: true, // Glassmorphism for settings
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

  // Load app with settings hash
  const settingsURL = isDev 
    ? `http://localhost:5173/#settings?tab=${tab}`
    : `file://${path.join(__dirname, '../dist/index.html')}#settings?tab=${tab}`

  if (isDev) {
    settingsWindow.loadURL(settingsURL)
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
      {
        label: 'Edge Go',
        enabled: false,
      },
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
        click: () => {
          createSettingsWindow()
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit(),
      },
    ])

  tray.setToolTip('Edge Go')
  tray.setContextMenu(buildMenu())

  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else mainWindow.show()
    tray.setContextMenu(buildMenu())
  })
}

// ─── IPC: Battery ─────────────────────────────────────────────────────────

ipcMain.handle('get-battery', async () => {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      exec(
        'wmic path win32_battery get EstimatedChargeRemaining,BatteryStatus /format:value',
        (err, stdout) => {
          if (err) {
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
            charging: statusMatch ? parseInt(statusMatch[1]) === 2 : false,
            available: true,
          })
        }
      )
    })
  } else {
    // Dev fallback — return a realistic mock
    return { level: 78, charging: false, available: true }
  }
})

// ─── IPC: System Info ─────────────────────────────────────────────────────

ipcMain.handle('get-system-info', () => ({
  platform: process.platform,
  hostname: os.hostname(),
  arch: os.arch(),
  version: app.getVersion(),
}))

ipcMain.handle('get-system-state', async () => {
  const state = {
    dnd: false,
    nightLight: false,
    brightness: 72
  };

  try {
    if (process.platform === 'win32') {
      // Get Brightness
      const brightnessOutput = await new Promise(r => exec('powershell (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness', (e, o) => r(o)));
      if (brightnessOutput) state.brightness = parseInt(brightnessOutput.trim()) || 72;

      // Get DND (Focus Assist) status via registry
      const dndOutput = await new Promise(r => exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v NOC_GLOBAL_SETTING_TOASTS_ENABLED', (e, o) => r(o)));
      if (dndOutput && dndOutput.includes('0x0')) state.dnd = true;
    }
  } catch (e) {
    console.error('Failed to get system state:', e);
  }

  return state;
})

// ─── IPC: Media Info ────────────

ipcMain.handle('get-media-info', async () => {
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      const betterScript = `
        tell application "System Events"
          set musicRunning to exists process "Music"
          set spotifyRunning to exists process "Spotify"
        end tell

        set output to ""

        if spotifyRunning then
          tell application "Spotify"
            try
              set t_state to player state as string
              set t_name to name of current track
              set t_artist to artist of current track
              set t_album to album of current track
              set t_duration to (duration of current track) / 1000
              set t_position to player position
              set t_volume to sound volume
              set output to output & t_name & "|||" & t_artist & "|||" & t_album & "|||" & t_duration & "|||" & t_position & "|||" & t_state & "|||" & t_volume & "|||" & "Spotify" & "###"
            end try
          end tell
        end if

        if musicRunning then
          tell application "Music"
            try
              set t_state to player state as string
              set t_name to name of current track
              set t_artist to artist of current track
              set t_album to album of current track
              set t_duration to duration of current track
              set t_position to player position
              set t_volume to sound volume
              set output to output & t_name & "|||" & t_artist & "|||" & t_album & "|||" & t_duration & "|||" & t_position & "|||" & t_state & "|||" & t_volume & "|||" & "Apple Music" & "###"
            end try
          end tell
        end if

        return output
      `;

      exec(`osascript -e '${betterScript}'`, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve([]);
          return;
        }
        const rawSessions = stdout.trim().split('###').filter(s => s.trim());
        const sessions = rawSessions.map(rs => {
          const parts = rs.split('|||');
          if (parts.length === 8) {
            return {
              title: parts[0],
              artist: parts[1],
              album: parts[2],
              duration: parseFloat(parts[3]) || 0,
              position: parseFloat(parts[4]) || 0,
              isPlaying: parts[5].toLowerCase().includes('playing'),
              volume: parseInt(parts[6]) || 0,
              source: parts[7],
              albumArt: null
            };
          }
          return null;
        }).filter(Boolean);
        resolve(sessions);
      });
    });
  } else if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const psScript = `
        $ErrorActionPreference = 'SilentlyContinue'
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $sessionManager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetResults()
        $sessions = $sessionManager.GetSessions()
        $results = @()
        foreach ($session in $sessions) {
            try {
              $props = $session.TryGetMediaPropertiesAsync().GetResults()
              $info = $session.GetPlaybackInfo()
              $timeline = $session.GetTimelineProperties()
              
              $sourceName = $session.SourceAppUserModelId
              $displaySource = "Media App"
              if ($sourceName -like '*spotify*') { $displaySource = 'Spotify' }
              elseif ($sourceName -like '*AppleMusic*') { $displaySource = 'Apple Music' }
              elseif ($sourceName -like '*chrome*') { $displaySource = 'Chrome' }
              elseif ($sourceName -like '*edge*') { $displaySource = 'Edge' }
              elseif ($sourceName -like '*Video*') { $displaySource = 'Video' }

              $results += @{
                  title = if ($props.Title) { $props.Title } else { "Unknown" }
                  artist = if ($props.Artist) { $props.Artist } else { "Unknown Artist" }
                  album = if ($props.AlbumTitle) { $props.AlbumTitle } else { "" }
                  isPlaying = ($info.PlaybackStatus -eq 'Playing')
                  position = if ($timeline.Position) { $timeline.Position.TotalSeconds } else { 0 }
                  duration = if ($timeline.EndTime) { $timeline.EndTime.TotalSeconds } else { 0 }
                  source = $displaySource
              }
            } catch {}
        }
        if ($results.Count -gt 0) { $results | ConvertTo-Json } else { "[]" }
      `;
      exec(`powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, (err, stdout) => {
        if (err || !stdout.trim()) { resolve([]); return; }
        try {
          let data = JSON.parse(stdout);
          if (!Array.isArray(data)) data = [data];
          const sessions = data.map(s => ({
            title: s.title || 'Unknown Title',
            artist: s.artist || 'Unknown Artist',
            album: s.album || '',
            duration: s.duration || 0,
            position: s.position || 0,
            isPlaying: !!s.isPlaying,
            volume: 50,
            source: s.source,
            albumArt: null
          }));
          resolve(sessions);
        } catch { resolve([]); }
      });
    });
  }
  return [];
})

ipcMain.on('update-settings', (event, settings) => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('settings-updated', settings);
    }
  });
});

ipcMain.handle('get-settings', () => null);

ipcMain.on('media-command', (_, command, value, source) => {
  if (process.platform === 'darwin') {
    let script = '';
    let target = source === 'Spotify' ? 'Spotify' : 'Music';
    if (command === 'playpause') script = `tell application "${target}" to playpause`;
    else if (command === 'next') script = `tell application "${target}" to next track`;
    else if (command === 'prev') script = `tell application "${target}" to previous track`;
    else if (command === 'seek') script = `tell application "${target}" to set player position to ${value}`;
    else if (command === 'volume') script = `tell application "${target}" to set sound volume to ${value}`;
    if (script) exec(`osascript -e '${script}'`);
  } else if (process.platform === 'win32') {
    let psCommand = '';
    if (command === 'playpause') psCommand = 'TryTogglePlayPauseAsync()';
    else if (command === 'next') psCommand = 'TrySkipNextAsync()';
    else if (command === 'prev') psCommand = 'TrySkipPreviousAsync()';
    
    if (psCommand) {
      const fullPs = `
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $sm = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetResults()
        $sessions = $sm.GetSessions()
        $targetSource = "${source}"
        foreach ($s in $sessions) {
            $id = $s.SourceAppUserModelId.ToLower()
            if ($targetSource -eq "Spotify" -and $id -like "*spotify*") {
                $s.${psCommand}.GetResults()
                return
            }
            elseif ($targetSource -eq "Apple Music" -and $id -like "*music*") {
                $s.${psCommand}.GetResults()
                return
            }
            elseif ($id -like "*$($targetSource.ToLower())*") {
                $s.${psCommand}.GetResults()
                return
            }
        }
        if ($sm.GetCurrentSession()) { $sm.GetCurrentSession().${psCommand}.GetResults() }
      `;
      exec(`powershell -ExecutionPolicy Bypass -Command "${fullPs.replace(/\n/g, ' ')}"`);
    }
  }
})

ipcMain.on('expand-window', (_, expanded) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  if (expanded) {
    mainWindow.setBounds({ width: 660, height: 200, x: Math.floor(sw / 2 - 330), y: 0 }, true)
  } else {
    mainWindow.setBounds({ width: 320, height: 40, x: Math.floor(sw / 2 - 160), y: 0 }, true)
  }
})

ipcMain.on('set-window-size', (_, { width, height }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  mainWindow.setBounds({ width, height, x: Math.floor(sw / 2 - width / 2), y: 0 }, true)
})

ipcMain.on('set-control-center', (_, isOpen) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  if (isOpen) {
    mainWindow.setBounds({ width: 360, height: 720, x: sw - 376, y: 0 }, true)
    mainWindow.setResizable(false)
  } else {
    mainWindow.setBounds({ width: 320, height: 40, x: Math.floor(sw / 2 - 160), y: 0 }, true)
  }
})

ipcMain.on('set-always-on-top', (_, value) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(value, 'screen-saver', 1)
})

ipcMain.on('set-launch-at-startup', (_, value) => {
  app.setLoginItemSettings({ openAtLogin: value, path: app.getPath('exe') })
})

ipcMain.on('quit-app', () => app.quit())

ipcMain.on('open-settings', (_, tab) => createSettingsWindow(tab))

ipcMain.on('close-settings', () => {
  if (settingsWindow) settingsWindow.close()
})

ipcMain.on('set-brightness', (_, level) => {
  if (process.platform === 'darwin') {
    exec(`osascript -e 'tell application "System Events" to repeat 16 times' -e 'key code 144' -e 'end repeat'`);
    const steps = Math.floor(level / 6.25);
    if (steps > 0) exec(`osascript -e 'tell application "System Events" to repeat ${steps} times' -e 'key code 145' -e 'end repeat'`);
  } else if (process.platform === 'win32') {
    exec(`powershell (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,${level})`)
  }
})

ipcMain.on('set-dnd', (_, enabled) => {
  if (process.platform === 'darwin') {
    exec(`defaults write com.apple.ncprefs DoNotDisturb -bool ${enabled}`);
  } else if (process.platform === 'win32') {
    exec(`powershell -Command "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' -Value ${enabled ? 0 : 1}"`);
  }
})

ipcMain.on('set-nightlight', (_, enabled) => {
  if (process.platform === 'win32') {
    const psCommand = `
      $path = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultNetworkCloudStore\\Data\\Microsoft.Settings.Displays.BlueLightReduction.Setting"
      $value = (Get-ItemProperty -Path $path).Data
      if ($value) {
        $value[24] = if ("${enabled ? 'true' : 'false'}" -eq "true") { 0x15 } else { 0x10 }
        Set-ItemProperty -Path $path -Name "Data" -Value $value
      }
    `;
    exec(`powershell -ExecutionPolicy Bypass -Command "${psCommand.replace(/\n/g, ' ')}"`);
  }
})

ipcMain.on('take-screenshot', () => {
  if (process.platform === 'darwin') exec('screencapture -ic')
  else if (process.platform === 'win32') exec('start ms-screenclip:')
})

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()

  try {
    createTray()
  } catch (e) {
    console.warn('Tray creation skipped:', e.message)
  }

  globalShortcut.register('Super+Alt+E', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else mainWindow.show()
  })

  globalShortcut.register('Super+Alt+S', () => {
    createSettingsWindow()
  })
})

app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    // We don't want to quit if the tray is active
    // app.quit() 
  }
})
