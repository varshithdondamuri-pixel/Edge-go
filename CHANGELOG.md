# Changelog

All notable changes to Edge Go are documented here.

---

## [v1.1.1] — 2026-05-16

### Patch
- docs: add `CHANGELOG.md` to repository
- chore: bump version to 1.1.1 to include changelog in clean release tag

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
