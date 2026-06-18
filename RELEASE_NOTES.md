# Edge Go / Clicky Windows Beta Release Notes

Welcome to the **Edge Go / Clicky Windows Beta** release! This version introduces complete offline operation, local codebase search, and voice activation controls.

---

## 🚀 Major Items

### 1. Completely Offline Agent Sidecar ("as self")
- **Zero-Dependency Core**: Fully removed the dependency on `google.antigravity` (Gemini API). Clicky now runs completely locally on your system, avoiding external API network requests and potential server latency.
- **Local Intent Classification**: Processes user queries locally using a fast vector-space tokenization classifier. It distinguishes intents like mouse actions, shell queries, Notion DB lookups, browser tasks, and general QA search.
- **System Command Execution**: Integrates real command execution (`subprocess`) and web browser operations (`webbrowser`) directly with your host machine.

### 2. Multi-Extension Codebase QA Search Index
- **Recursive File Crawler**: The offline QA search engine now recursively indexes not only Markdown (`.md`) and Text (`.txt`) documents, but also active code files including Python (`.py`), JavaScript (`.js`, `.jsx`), JSON (`.json`), HTML (`.html`), and CSS (`.css`).
- **Code Line Chunking**: Automatically slices source code files into 15-line chunks to make code snippets and functions fully searchable locally via TF-IDF cosine similarity.

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
