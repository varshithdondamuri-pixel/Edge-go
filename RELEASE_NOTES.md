# Edge Go v2.1.0 Release Notes

Welcome to **Edge Go v2.1.0**! This major release delivers Microsoft Bing Web Search API v7 integration, Windows `.exe` packaged execution auto-discovery, UTF-8 stream stability guards, and interactive daemon connection management.

---

## 🚀 Major Highlights in v2.1.0

### 1. Microsoft Bing Web Search API v7
- **Official Bing API v7 Integration**: Direct support for Microsoft Bing Web Search API v7 (`https://api.bing.microsoft.com/v7.0/search`) with `Ocp-Apim-Subscription-Key`.
- **Dynamic Key Sync**: Configure Bing API Key in the Settings panel; updates automatically sync to the running agent daemon.
- **Resilient Fallbacks**: Automatic fallback to DuckDuckGo/Bing web search if an API key is omitted or unavailable so web search always works smoothly.

### 2. `.EXE` Packaged Build Auto-Discovery & Crash Prevention
- **Windows Python Candidate Resolver**: Scans `%LOCALAPPDATA%`, `C:\Program Files`, and system drives to discover Python executables even if not present in system `PATH`.
- **UTF-8 Output Guard**: Forces `PYTHONIOENCODING=utf-8` and safe stdout/stderr stream reconfiguration to prevent `UnicodeEncodeError` crashes on Windows when logging Unicode & emojis.
- **Manual Reconnect Control**: Added an interactive **Reconnect** button in the HUD header to instantly recover daemon status if offline.

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
