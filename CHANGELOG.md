# Changelog

All notable changes to Edge Go are documented here.

## [3.0.0] - 2026-09-06

Base Edition — the base HUD runs on its own, with system controls actually wired to the system. No UI or layout changes.

### Changed
- **Base build no longer includes the AI agent**: the Python agent daemon started unless Beta mode was explicitly disabled, so a clean install spawned Python on every launch. It now starts only when Beta mode is on.
- **Agent pointer overlay is Beta-only**: the full-screen overlay window was created at every startup; it is now created and destroyed together with Beta mode.
- **No microphone prompt in the base build**: the renderer requested microphone access unconditionally; it now waits for Beta mode.
- **Brightness writes are coalesced**: one PowerShell/WMI process per slider value (~40 ms apart) is replaced by a single in-flight call that always applies the newest value; renderer throttle raised to 90 ms.
- **Visualizer bars animate via transform** instead of `height`, removing a per-frame layout pass inside the notch's blurred surface.
- **Clock ticks on the minute** rather than every second, since only minutes are displayed.

### Fixed
- **macOS startup crash**: `systemPreferences` was used without being imported, so the reference threw inside `app.whenReady()` and the window, tray and global shortcuts were never created. The mic-permission IPC handlers failed on every platform for the same reason.
- **Agent daemon could not load**: the body of `process_prompt()` sat outside its own `try`, raising `SyntaxError: expected 'except' or 'finally' block` on import.
- **Volume slider toggled playback on macOS**: `volume` and `seek` fell through into the play/pause mapping. Both are now handled as real system calls, and system volume is read back from the OS instead of a stale constant.
- **Album art was blocked everywhere**: the content-security policy defined no `img-src`, so it fell back to `default-src 'self'` and blocked both the media daemon's `data:` artwork and the online `https:` fallback. Covers now render in the notch, banners, Control Center and player.
- **Sneak-peek banner never dismissed**: its 3.5 s timer restarted on every parent render while the position clock ticked.
- **Media pipeline could hang**: the artwork lookup used `https.get`'s `timeout` option without handling the event, so a stalled request never resolved — `get-media-info` waited forever and each poll opened another socket. macOS `osascript` media getters had no timeout for the same reason.
- **Stacked media daemons**: every failed daemon write could spawn another Windows SMTC PowerShell poller; only one runs now, and its handle is cleared on exit.
- **Duplicate window resizes**: two effects sent conflicting `set-control-center` values in the same render, resizing and refocusing the window twice per overlay toggle.
- **React hook-order violation**: a `useEffect` was declared after an early return in the app root.
- **Redundant re-renders**: media polling replaced state every 2 s even when the track was unchanged.
- **Sync Bridge could not be closed with Escape**, which risked stranding the window at full-screen size.

## [2.2.0] - 2026-07-31

### Added
- **Notch Universal System Sync Bridge**: Integrated direct `NotchSyncBridge` modal and header connector button (`🔗`) for live control over themes, rules, media sources, and agent settings.
- **Interactive "Okay" Confirmation Authorization**: Prompt dialog before applying system modifications or profile imports.
- **Cross-System Profile Export & Import**: 1-click `Export Profile JSON` and `Import System Profile` for cross-machine synchronization.
- **Executable `.exe` Loader & File Picker**: Integrated native Windows File Explorer picker and `launch_exe` agent intent for launching `.exe`, `.cmd`, `.bat`, and `.lnk` files.
- **Sneak Peek Track Change Banner**: Sliding glass overlay inside NotchBar notifying song title, artist, and media source on track changes.

### Fixed
- **Windows Media Controls**: Added global Windows `keybd_event` (VK_MEDIA_PLAY_PAUSE) fallback so Play/Pause works across Spotify, Windows Media, and browsers.
- **Voice Wake Microphone Stream**: Fixed audio capture stream lifecycle and added `dynamic_energy_threshold = True` for instant "Hey Clicky" response.
- **Zero-Config Web Search**: Added DuckDuckGo & Wikipedia API fallbacks so search works out-of-the-box without requiring a Bing key.

## [2.1.0] - 2026-07-29

### Added
- **Microsoft Bing Web Search API v7**: Integrated direct REST calls to Bing Web Search API v7 (`https://api.bing.microsoft.com/v7.0/search`) with `Ocp-Apim-Subscription-Key` support and fallback to public search.
- **Bing API Settings Integration**: Added a dedicated Bing Web Search API key input row in Settings panel under AI Agent Mode with instant config sync to running Python daemon.
- **Agent Daemon Reconnect Control**: Added an interactive **Reconnect** button in AgentPanel status header to instantly recover agent daemon connectivity if offline.
- **Search Provider Badging**: Display live provider badges (e.g. `Bing Web Search API v7`) on web search cards.

### Fixed
- **Packaged `.exe` Windows Python Auto-Discovery**: Implemented deep candidate search across `%LOCALAPPDATA%`, `C:\Program Files`, and system drives to discover Python executables even if not in system `PATH`.
- **UTF-8 Stream Output Guard**: Enforced `PYTHONIOENCODING=utf-8` and stream reconfiguration to prevent `UnicodeEncodeError` crashes on Windows when printing emojis or non-ASCII search results.
- **Workspace Optimization**: Cleaned up unneeded legacy subdirectories and artifacts.

## [1.10.0] - 2026-07-14

### Added
- **macOS Media Integration**: Restored macOS media integration via AppleScript/osascript, enabling support for Spotify and Apple Music playback controls, volume tracking, and current song detail extraction.
- **Microphone Permissions Error Feedback**: Added interactive UI warning alerts when microphone initialization fails, guiding users on how to enable system microphone access.

### Fixed
- **Control Center macOS Menu Bar Overlap**: Shifted the top vertical alignment of the Control Center panel down to `38px` on macOS to prevent overlap with the native system menu bar.
- **PowerShell Execution Policy Bypass**: Explicitly bypasses execution policies in `runPowerShell` scripts on Windows to prevent runtime authorization blocks.
- **Control Center Blur Focus Lock**: Implemented debounced delay (150ms) on closing Control Center and Clipboard panel during window blur events, preventing immediate dismissal when clicking interactive elements.
- **Optimized Windows Volume Adjustment**: Removed unnecessary delayed fallback loops on successful Windows WASAPI volume commands to eliminate IPC lag.
- **Voice Agent Command Listening**: Increased the wake-word listener command-capturing timeout to 15 seconds and max phrase limit to 20 seconds, allowing for longer, more descriptive commands.

## [1.9.0] - 2026-07-07

### Added
- **Standard MusicPlayer in Control Center**: Replaced custom music quick-controls in the Control Center with the full-featured, responsive `MusicPlayer` component, adding interactive progress tracking and seek support.

### Fixed
- **Music Widget Syncing**: Fixed music banner not syncing or displaying in the Control Center when Beta Mode is disabled.
- **Clean Control Center Layout**: Hides the AI Agent panel when Beta Mode is turned off, preventing a non-functional, offline input box from cluttering the Control Center on clean installations.

## [1.8.1] - 2026-07-05

### Fixed
- **Windows launch visibility**: New installs now open as a visible, clickable top-center notch and show in the Windows taskbar by default.
- **Reliable restore behavior**: Tray, hotkey, agent wake, and second-instance launches now use the same restore path so the notch reappears with correct bounds, focusability, and always-on-top behavior.

## [1.8.0] - 2026-06-30

### Added
- **AI Agent Settings Tab**: Integrated options into the Settings panel for enabling/disabling Agent mode, selecting voice profiles (Default, Male, Female, British, Robot Synth), choosing microphone source, configuring agent folder, toggling agent permissions/integrations, and visibility preferences.
- **Voice Synthesis (TTS)**: Added audio speech response generation using the browser's Web Audio & SpeechSynthesis API when the AI agent completes tasks.
- **Robust Wake-Word Matcher**: Expanded regex/phonetic matches in `speech_listener` for "Hey Clicky" (supporting variants like clicky, clickies, click, clique, cliky, cliki, hey click, wake).
- **Progress Track Keyboard Accessibility**: Enabled Arrow keys (`ArrowLeft`/`ArrowRight`) to seek backward/forward by 5 seconds on the media player progress bar.
- **Volume Mute/Unmute Shortcut**: Click on the speaker icon in the music player to instantly mute or unmute the system, remembering the last non-zero volume.
- **Active Voice Command Processing**: Upgraded the agent voice-wake system. If the user says a command immediately after the wake word (one-shot, e.g., "Hey Clicky, show git status"), the agent automatically transcribes and processes it. If only the wake word is heard, the agent enters a 4-second command-listening mode, populates the UI input box visually with the transcribed query, and auto-submits it.
- **Premium Glassmorphic HTML Pages**: Upgraded the HTML generator template with ultra-premium styling. Websites now load modern Google Fonts (`Plus Jakarta Sans` and `Space Grotesk`), use glassmorphic cards with responsive layout grids, float micro-animations, glowing borders, custom shadows, and mesh background gradients. This ensures high visual contrast against any system wallpaper.

### Fixed
- **Robust Python Spawning**: Implemented fallback search of python executables (`python`, `python3`, `py` on Windows; `python3`, `python` on macOS/Linux) and multi-path loading fallback for local `.env` files (renderer root, executable directory, or userData folder).
- **Graceful Connection States**: Implemented instant connecting/offline state broadcasting to ensure accurate UI synchronization of the AI Agent connection indicator.
- **AC Connection & Time Remaining**: Extended battery monitoring to support `acConnected` plugged-in status (without charging) and display the `timeRemaining` metric on Windows.
- **Cleaned Up Pro Upgrade Banner**: Removed the placeholder Pro Upgrade banner in the Settings About tab.
- **Upgraded Music Control Icons**: Redesigned Play, Pause, Prev, and Next SVG icons with rounded corners, proper paths, and a cleaner aesthetic.

## [1.7.0] - 2026-06-16

### Fixed
- **Windows Volume Control**: Fixed bug where setting system volume to 0 in the UI reset it to the last known volume level.
- **Safety Checks**: Safeguarded component rendering logic (MusicPlayer, BatteryIndicator, ControlCenter, NotchBar) against null or undefined media and battery properties.
- **Cleaned Up Repository**: Removed unused/legacy macOS project assets.

## [1.6.1] - 2026-06-02

### Added
- **Non-Windows Warning**: Added a runtime warning log when starting on non-Windows platforms.

### Fixed
- **Media Polling & Caching**: Added caching for WinRT SMTC session manager and album art base64 strings to reduce CPU/memory overhead.
- **Robust JSON & Number Parsing**: Upgraded PowerShell JSON converter and media seek parsing to be invariant-culture aware, preventing failures on non-US localized Windows setups.
- **Debounced Media Output**: Reduced stdout chatter by only outputting media updates when the playing state, track title, or volume changes.
- **Safety Check in MusicPlayer**: Guarded `formatTime` helper against `NaN` or non-number inputs to prevent UI rendering crashes.

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
