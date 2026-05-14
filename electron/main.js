const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  screen,
  nativeImage,
  systemPreferences,
  globalShortcut,
} = require('electron')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')

const isDev = !app.isPackaged

let mainWindow
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
    // Open devtools detached so they don't affect window size
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

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
          if (!mainWindow) return
          mainWindow.show()
          mainWindow.webContents.send('open-settings')
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

// ─── IPC: Media Info (stub — real impl would use Windows SMTC) ────────────

ipcMain.handle('get-media-info', () => {
  // In a real Windows implementation this would query SMTC via native module.
  // For now return null so the renderer uses its mock.
  return null
})

// ─── IPC: Window Resize ────────────────────────────────────────────────────

ipcMain.on('expand-window', (_, expanded) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  isExpanded = expanded

  if (expanded) {
    mainWindow.setBounds(
      { width: 660, height: 180, x: Math.floor(sw / 2 - 330), y: 0 },
      true
    )
  } else {
    mainWindow.setBounds(
      { width: 320, height: 40, x: Math.floor(sw / 2 - 160), y: 0 },
      true
    )
  }
})

ipcMain.on('set-window-size', (_, { width, height }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize
  mainWindow.setBounds(
    { width, height, x: Math.floor(sw / 2 - width / 2), y: 0 },
    true
  )
})

ipcMain.on('set-always-on-top', (_, value) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setAlwaysOnTop(value, 'screen-saver', 1)
})

ipcMain.on('set-launch-at-startup', (_, value) => {
  app.setLoginItemSettings({
    openAtLogin: value,
    path: app.getPath('exe')
  })
})

ipcMain.on('quit-app', () => {
  app.quit()
})

// ─── App lifecycle ─────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Disable GPU compositing quirks on Windows for transparent windows
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-gpu')
  }

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
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.webContents.send('open-settings')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
