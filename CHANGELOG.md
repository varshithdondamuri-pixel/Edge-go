# Changelog

All notable changes to Edge Go are documented here.

## [1.6.0] - 2026-05-29

### Added
- **System Volume Synchronization**: Added real-time volume fetching (polling every 10 seconds via IPC/PowerShell on Windows) and hotkey listeners (`AudioVolumeUp`/`AudioVolumeDown`/`AudioVolumeMute`).
- **Wi-Fi Network Scanner & Connector**: Implemented scanning and list display of nearby Wi-Fi networks, along with support for connecting to saved Wi-Fi networks directly from the HUD on Windows.
- **Control Center Dropdown**: Added Wi-Fi network listing dropdown, connecting/loading states, and updated styled controls.

## [1.5.1] - 2026-05-29

### Fixed
- **Windows system control permissions**: Upgraded Wi-Fi and Bluetooth controls to use non-administrative WinRT `Windows.Devices.Radios.Radio` APIs to prevent permission denied errors.
- **Windows SMTC C# Bridge**: Restored the missing C# `SmtcBridge` class definition in the media daemon.
- **macOS Cleanup**: Removed all unwanted macOS dev bridge control files and routes.

## [1.5.0] - 2026-05-28

### Added
- **Windows SMTC C# Bridge**: Replaced the fragile PowerShell reflection approach with a compiled C# `Add-Type` class (`SmtcBridge`) that uses proper `using Windows.Media.Control` — far more reliable across Windows 10/11 and .NET versions.
- **Spotify Window-Title Fallback**: Two-level fallback — PowerShell `Get-Process Spotify` + Node-side `tasklist /V` — detects Artist/Track from the Spotify window title even when SMTC fails entirely.
- **Real-time Push IPC**: `pushMediaUpdate()` now sends a `media-update` IPC event to the renderer instantly when media changes. `App.jsx` subscribes via `onMediaUpdate` alongside polling — track changes appear in under 100ms.
- **macOS Dev Bridge**: Platform-gated `osascript` daemon (no-op on Windows) for Spotify and Apple Music — enables testing on macOS without Windows SMTC.
- **Album Art Glow Pulse**: Subtle `albumGlow` animation on the album art while media is playing — pulses accent color every 3 seconds.
- **`playing` CSS Class**: `MusicPlayer` now adds `.playing` to the root div, enabling CSS selectors to target the playing state.

### Fixed
- **Media not connecting**: SMTC was silently failing due to `$ErrorActionPreference = 'SilentlyContinue'` swallowing all errors. Now uses `'Stop'` with `Write-Error` and a full stderr pipe to Node console for visibility.
- **Execution Policy Block**: Added `-ExecutionPolicy Bypass` to PowerShell spawn args so the script runs regardless of system policy.
- **Clock hidden when Calendar disabled**: Expanded-view Clock was incorrectly gated by `showCalendar` setting. Clock is now unconditionally visible; only `CalendarMini` respects the toggle.
- **Notch force-collapse on overlay close**: `set-control-center` IPC no longer sets `expanded=false` when the overlay closes — hover system handles collapse timing naturally.

### Changed — Smoothness Overhaul
- **Easing curves**: All transitions upgraded from Material Design linear (`cubic-bezier(0.4,0,0.2,1)`) to spring/overshoot curves (`cubic-bezier(0.34,1.20,0.64,1)`)
- **Notch animation**: 480ms spring (was 400ms linear), plus 16ms IPC delay so CSS spring starts before native window resize — eliminates snap-then-animate flash
- **Content crossfade**: Collapse fades out in 180ms, expand waits 120ms then fades in over 260ms — no gap between states
- **Progress bar**: Grows from 4px → 6px on hover (spring), thumb springs in from center (`scale(0)` → `scale(1)`)
- **Volume slider**: Expands 60px → 72px on hover (spring), thumb spring scale
- **Play/Pause button**: `scale(1.10)` hover + enhanced glow, `scale(0.90)` press — spring curve throughout
- **Prev/Next buttons**: `scale(1.12)` hover, `scale(0.88)` press — spring
- **Visualizer**: Sine easing (`cubic-bezier(0.45,0,0.55,1)`), unique duration per bar (0.47s–0.65s) for organic feel
- **GPU promotion**: `backface-visibility: hidden` on all animated layers to eliminate sub-pixel jitter
- **Hover → expand delay**: 160ms (was 200ms) — more responsive
- **Leave → collapse delay**: 500ms (was 400ms) — less accidental collapse

---

## [1.4.0] - 2026-05-26

### Added
- **Windows Media Daemon**: Replaced periodic polling of SMTC media queries with a persistent background PowerShell daemon, delivering instant updates and 0% CPU polling overhead.
- **Smooth CSS Transitions**: Implemented hardware-accelerated CSS absolute positioning for collapsed/expanded notch views to prevent layout engine reflows and stutters.
- **Windows Resize Optimization**: Added transition-delayed window collapsing on Windows to avoid OS resizing lag and prevent content clipping.

### Fixed
- **Windows Transparent Window Visibility**: Resolved issues where the transparent window renders invisibly or black on Windows startup by setting `show: false` in BrowserWindow constructor and showing only when `ready-to-show` fires.
- **macOS Media Info Compilation**: Fixed compile-time syntax errors in AppleScript when Spotify is not installed on macOS by isolating Spotify and Apple Music queries into independent processes.
- **Clipboard History Overlay Clipping**: Enlarged the Electron window to full-screen when the clipboard history panel is open to prevent clipping.

## [1.3.0] - 2026-05-16

### Fixed
- **Notch position (left/center/right)** now correctly repositions the window via IPC `set-notch-position`
- **Control Center** restores window to the correct saved position (not hardcoded center) when closed
- **Expand/collapse** respects saved `notchPosition` and `collapsedWidth` from settings
- **PowerShell SMTC** media commands now use proper `AsTask` bridge instead of broken `GetAwaiter().GetResult()` on WinRT
- **Media polling** correctly uses the proper `IAsyncOperation` generic type for `TryGetMediaPropertiesAsync`
- **Settings → main window sync** fixed: changes in Settings window immediately propagate to NotchBar via `settings-updated` IPC
- **Apple Music** label replaced with Spotify / Windows apps (Chrome, Edge, Firefox, VLC, Groove, WMP)
- **Mac keyboard shortcuts** (⌘⇧) replaced with Windows shortcuts (Win+Alt)
- **About tab** now shows correct version v1.3.0 and platform info
- **Connectors tab** shows Windows-native media sources (Spotify, Browser, WMP)

### Changed
- `notchState` tracker in `main.js` remembers current position/width across all window operations
- Media command PowerShell uses `AwaitAction` helper for `IAsyncAction` operations (play/pause/next/prev)
- App.jsx: settings broadcast uses ref guard to avoid overwriting settings on initial mount

---

---

## [v1.2.0] — 2026-05-16

### Breaking Changes
- **Windows-only release** — all macOS/AppleScript code removed from `electron/main.js`

### Bug Fixes
- Fixed PowerShell media commands crashing due to quote-escaping — now uses `-EncodedCommand` (base64)
- Fixed Control Center window expansion — now correctly covers the full screen for the overlay
- Fixed transparent window showing white corners on Windows — added `backgroundColor: '#00000000'`
- Fixed Settings window transparency glitch on Windows
- Fixed `window-all-closed` incorrectly allowing quit — app now stays alive in system tray
- Fixed collapsed notch height clipping content — increased from 40px to 44px

### Removed (macOS)
- `osascript` / AppleScript media info and playback control
- `osascript` brightness key simulation
- `defaults write com.apple.ncprefs` DND toggle
- `screencapture` screenshot command
- `setVisibleOnAllWorkspaces` (macOS-only Electron API)
- All `process.platform === 'darwin'` branches

### Improvements
- PowerShell media polling now uses proper `async/await` (`GetAwaiter().GetResult()`)
- Media source labels updated: Chrome, Edge, Firefox, VLC, Groove Music, Windows Media
- `setAlwaysOnTop` level changed from `'screen-saver'` to `'pop-up-menu'` (correct for Windows)
- Tray menu now shows app version

---

## [v1.1.0] — 2026-05-16


### Bug Fixes
- **Control Center** no longer closes when clicking tiles, sliders, or internal buttons
  - Root cause: click events on panel children were bubbling up to the full-screen backdrop
  - Fix: added `stopPropagation` on the panel root element

### New Components
- `ControlCenter.jsx` — Wi-Fi, Bluetooth, Airplane Mode, Focus Mode, brightness/volume sliders, quick tiles (DND, Night Light, Screenshot), battery status
- `ClipboardDock.jsx` — clipboard history dock with search, copy-on-click, and clear all

### Theme System Overhaul
- **`:root`** now defines clean **light-mode** defaults for all CSS custom properties
- **`.dark`** class overrides all tokens (background, surface, border, text, shadows)
- Every component adapts automatically — no more per-element dark/light overrides needed

### UI Polish
- Notch expanded state: glassmorphic white in light mode, rich dark glass in dark mode
- Control Center panel, tiles, sliders, focus pills, network list, media section — all theme-aware
- Settings standalone panel sidebar and content area — both themes
- Clipboard dock header, search field, item backgrounds, scrollbar — all themed
- Settings toggles, selects, and sliders use CSS variables
- About page links and accent-dot selection ring — all themed

---

## [v1.0.0] — 2026-05-14

### Initial Release
- Always-on-top floating HUD bar for Windows
- Collapsible notch with smooth spring animation
- Media player with album art, progress bar, and source detection
- Battery indicator with charging state
- Mini clock and calendar
- Settings panel with accent colour, corner radius, width, blur, and animation speed controls
- Clipboard dock (basic)
- Control Center (basic)
- Dark / light mode toggle
- Windows NSIS installer via electron-builder
- Desktop and Start Menu shortcuts
- Auto-launch on startup option
