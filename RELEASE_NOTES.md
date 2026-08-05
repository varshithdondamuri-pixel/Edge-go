# Edge Go v2.2.0 Release Notes

Welcome to **Edge Go v2.2.0**! This major release delivers rate-limited Bing API search (capped to 10 requests), Vosk offline speech recognition support, non-blocking Sneak Peek media banners, Control Center UI cleanup, and offline local TF-IDF document search.

---

## 🚀 Major Highlights in v2.2.0

### 1. Bing API Search Capping & Settings Control
- **10 Request Search Limit**: Direct support for Microsoft Bing Web Search API v7 with configurable search limits (default 10, max 10 requests).
- **Settings Integration**: Added Search Results Limit control in the Settings panel under Web Search & Bing API.
- **Offline Fallbacks**: Graceful fallback to DuckDuckGo and local documentation search when offline or when API limits are reached.

### 2. Vosk Offline STT Engine & Resilient Voice Listener
- **Vosk Offline Speech Recognition**: Added support for `vosk` (`recognize_vosk`) for 100% local, offline voice recognition without cloud dependencies.
- **Reliable Prompt Execution**: Enforced `try...finally` state cleanup in Python daemon (`agent_daemon.py`) so `agent_busy` and `status: idle` are guaranteed to reset.

### 3. Non-Blocking Media Banner & Control Center Sync
- **Non-Blocking Inset Banner**: Configured `.notch-sneak-banner` with `pointerEvents: 'none'` so active song notifications never block user clicks or freeze player controls.
- **Synced Control Center Banner**: Added a synced Now Playing media banner directly inside the Control Center panel.
- **Control Center Row Cleanup**: Removed redundant quick tile overflow for a clean, responsive layout.

### 4. Notch Universal System Sync Bridge & Cross-System Import/Export
- **🔗 Sync Bridge Controller**: Direct Notch connector button in NotchBar header for real-time control over themes, system rules, media sources, and permissions.
- **✓ Okay Confirmation Authorization**: Interactive "Confirm System Change? (Okay / Cancel)" dialog before applying any system tweak or profile import.
- **Cross-System Syncing**: 1-click `Export Profile JSON` and `Import System Profile` to easily mirror configurations across multiple machines.

---

## 🎙️ Voice Activation & Controls

### Live "Hey Clicky" Wake-Word Loop
- **Background Audio Listener**: Implements a continuous background thread utilizing `speech_recognition` and the system microphone.
- **Auto-Expansion**: When "Hey Clicky" or "Hey" is spoken, the floating Notch automatically expands, flashes a glowing blue outline, and enters listening mode.
- **Web Audio Chime**: Synthesizes a futuristic ascending chime sound effect (`C5 -> E5 -> G5 -> C6`) directly through the browser Web Audio API upon wake trigger.
- **Interactive UI Toggles**: Toggle voice activation on or off dynamically in the Agent tab settings panel.

---

## 🛠️ Minor Items

- **Visual Pointer Overlays**: Animated Bezier curves map mouse paths to target coordinates with custom ripple click visual feedback.
- **Active Subagent progress cards**: Subtasks are broken down dynamically and rendered as active progress cards inside the HUD.
- **Simulated Instagram Feed**: Added a live updating simulated social feed in the Control Center panel.
- **Speech/pyautogui Fallbacks**: Robust error handling that gracefully falls back to emulation mode if microphone or display GUI permissions are not available.
