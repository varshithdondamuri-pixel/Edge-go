# Changelog

All notable changes to Edge Go are documented here.

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
