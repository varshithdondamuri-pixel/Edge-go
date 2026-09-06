# Edge Go v3.0.0 (Base Edition) Release Notes

**Edge Go v3.0.0 Base Edition** is the release where the base HUD stands on its own. No AI agent, no Python, no background daemon — just the notch, with system controls that are actually wired to the system.

v2.3.0 promised a clean agent-free HUD with synced banners and smooth sliders. This release is the one that delivers it: the defects that quietly broke those promises have been found and fixed.

---

## 🚀 Major Highlights in v3.0.0

### 1. 🪶 A Real Base Build (No AI Agent)
- **The agent no longer ships in the default experience.** Previously the Python agent daemon started on every launch unless Beta mode had been explicitly turned off, so a clean install spawned Python in the background and retried across every interpreter it could find.
- **No stray overlay window.** The full-screen agent pointer overlay was created at startup on every install; it is now created only alongside Beta mode.
- **No microphone prompt.** A base install never asks for microphone access — that request belongs to the voice agent and now waits for Beta mode.
- **Beta mode still works.** Turning Beta on brings the agent, overlay and voice stack up exactly as before. Nothing was removed, only un-defaulted.

### 2. 🔊 Volume & 🔆 Brightness Genuinely Connected
- **Volume controls the system, not playback.** On macOS the volume and seek commands were falling through into the play/pause mapping — dragging the volume slider was toggling your music. Both are now real system calls.
- **Brightness tracks the slider.** Every slider value used to spawn its own PowerShell/WMI process a few milliseconds apart, which buried the machine and let results land out of order. Writes are now collapsed to a single call that always applies the newest value.
- **Volume reads back for real.** The current output volume is queried from the system instead of returning a stale placeholder.

### 3. 🎵 Now Playing Banners That Actually Appear
- **Album art is no longer blocked.** The app's content-security policy had no image rule, so it silently blocked every cover — both the Windows media daemon's embedded artwork and the online artwork fallback. Covers now render in the notch, the sneak-peek banner, the Control Center and the player.
- **The sneak-peek banner dismisses again.** Its 3.5-second timer was being restarted on every render, so while a track was playing the banner never went away.
- **Media info can't freeze.** A stalled artwork lookup could leave the media pipeline waiting forever, stopping all track updates and leaking a socket on every poll. Lookups now time out cleanly.

### 4. ⚡ Smoothness
- **Composited visualizer.** The audio bars animated their height, forcing a layout pass every frame inside a blurred surface. They now animate with a transform — identical look, far cheaper.
- **Nothing animates while hidden.** Both notch views stay in the DOM at zero opacity; their looping animations kept repainting behind the scenes and are now parked while out of view.
- **Fewer wasted renders.** Media polling refreshed the whole interface every couple of seconds even when the track hadn't changed, and the clock re-rendered every second to display minutes.
- **One window resize per action.** Opening an overlay used to send two conflicting resize commands in the same frame, so the window resized and refocused twice.
- **No stacked background pollers.** A failed media command could spawn an additional Windows media daemon each time; only one ever runs now.

### 5. 🩹 Stability
- **Fixed a macOS startup crash** caused by a missing Electron import, which prevented the window, tray and shortcuts from being created at all.
- **Fixed a syntax error** that stopped the agent daemon module from loading.
- **Fixed a React hook-order violation** in the app root.
- **Escape closes the Sync Bridge**, which previously could only be dismissed with its ✕ button.

---

## 📦 Installation

1. Download `Edge-Go-Next-Setup-3.0.0.exe` from the [Releases](https://github.com/varshithdondamuri-pixel/Edge-go/releases) page.
2. Run the installer and pick an install location.
3. Edge Go launches automatically and can be set to start with Windows.

Upgrading from v2.x keeps your existing settings. Beta/agent mode stays off unless you switch it on in Settings.
