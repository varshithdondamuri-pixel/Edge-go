# Edge Go v2.2.0 Release Notes

Welcome to **Edge Go v2.2.0**! This release delivers the streamlined Notch HUD floating bar, Universal System Sync Controller, non-blocking Sneak Peek media banners, and Control Center UI enhancements.

---

## 🚀 Major Highlights in v2.2.0

### 1. Notch Universal System Sync Bridge & Profile Control
- **🔗 Sync Controller**: Direct Notch connector button in the NotchBar header for real-time control over system themes, rules, and media sources.
- **✓ Interactive "Okay" Authorization**: Prompt confirmation dialog before applying system tweaks or loading profile settings.
- **Cross-System Profile Import & Export**: 1-click `Export Profile JSON` and `Import System Profile` to easily save and mirror configurations across machines (`notch-profile.json`).

### 2. Media Banners & Control Center Sync
- **Non-Blocking Sneak Peek Banner**: Inset song notifications configured with pass-through interaction (`pointerEvents: 'none'`) so active banners never block clicks or freeze player controls.
- **Synced Control Center Media Banner**: Live Now Playing banner integrated right inside the Control Center header.
- **Media Controls & SMTC Fallbacks**: Unified media playback controls across Spotify, Windows Media, and system browsers.

### 3. Clean Control Center Layout & System Toggles
- **Streamlined Control Center**: Removed redundant tile clutter for a clean, fast-loading interface.
- **Quiet & Focus Mode Controls**: Quick toggles for Notifications On / Do Not Disturb quiet mode.
- **Executable `.exe` Launcher**: Integrated Windows File Explorer launcher to open `.exe`, `.cmd`, `.bat`, or `.lnk` programs directly from the Sync Controller.
