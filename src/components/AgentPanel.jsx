import React, { useState, useEffect, useRef, useCallback } from 'react'

/* ── Intent → visual meta ──────────────────────────────────── */
const INTENT_META = {
  git:             { icon: '📁', color: '#22c55e', label: 'Git' },
  click:           { icon: '🎯', color: '#3b82f6', label: 'Click' },
  web_search:      { icon: '🌐', color: '#f59e0b', label: 'Web Search' },
  create_html:     { icon: '🎨', color: '#a855f7', label: 'HTML Creator' },
  create_document: { icon: '📄', color: '#06b6d4', label: 'Document' },
  play_video:      { icon: '▶️', color: '#ec4899', label: 'Video' },
  microsoft_app:   { icon: '🖥️', color: '#0078d4', label: 'Microsoft' },
  multi_agent:     { icon: '🤖', color: '#7c6af7', label: 'Multi-Agent' },
  screenshot:      { icon: '📸', color: '#84cc16', label: 'Screen' },
  instagram:       { icon: '📸', color: '#e1306c', label: 'Instagram' },
  whatsapp:        { icon: '💬', color: '#25d366', label: 'WhatsApp' },
  browser:         { icon: '🌍', color: '#f97316', label: 'Browser' },
  notion:          { icon: '📝', color: '#ffffff', label: 'Notion' },
  help:            { icon: '👋', color: '#7c6af7', label: 'Help' },
  qa_search:       { icon: '🔍', color: '#94a3b8', label: 'Knowledge' },
}

const AGENT_TYPE_META = {
  researcher: { icon: '🔬', color: '#f59e0b' },
  creator:    { icon: '🎨', color: '#a855f7' },
  executor:   { icon: '⚡', color: '#3b82f6' },
  reviewer:   { icon: '🔍', color: '#22c55e' },
  writer:     { icon: '✍️', color: '#06b6d4' },
  analyst:    { icon: '📊', color: '#ec4899' },
}

function playWakeSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    const now = ctx.currentTime
    osc.frequency.setValueAtTime(523.25, now)
    osc.frequency.setValueAtTime(659.25, now + 0.08)
    osc.frequency.setValueAtTime(783.99, now + 0.16)
    osc.frequency.setValueAtTime(1046.50, now + 0.24)
    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(now + 0.6)
  } catch (e) {}
}

/* ── Sub-components ────────────────────────────────────────── */

function SearchResultCard({ results, query }) {
  if (!results?.length) return null
  return (
    <div className="ap-result-card search-card">
      <div className="ap-card-header">
        <span className="ap-card-icon">🌐</span>
        <span className="ap-card-title">Web Search: <em>{query}</em></span>
        <span className="ap-card-badge">{results.length} results</span>
      </div>
      <div className="ap-search-results">
        {results.map((r) => (
          <a
            key={r.rank}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ap-search-result-row"
          >
            <span className="ap-search-result-rank">{r.rank}</span>
            <span className="ap-search-result-body">
              <span className="ap-search-result-title">{r.title}</span>
              {r.snippet && <span className="ap-search-result-snippet">{r.snippet}</span>}
              <span className="ap-search-result-url">{r.url}</span>
            </span>
            <span className="ap-search-result-arrow">↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}

function FileCreatedCard({ file, fileType, title }) {
  const extIcons = { html: '🎨', txt: '📃', md: '📝', docx: '📄', xlsx: '📊', csv: '📊', py: '🐍', js: '⚡' }
  const icon = extIcons[fileType] || '📄'
  const filename = file ? file.split(/[\\/]/).pop() : 'file'
  return (
    <div className="ap-result-card file-card">
      <div className="ap-card-header">
        <span className="ap-card-icon">{icon}</span>
        <span className="ap-card-title">{title || filename}</span>
        <span className="ap-card-badge" style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>created ✓</span>
      </div>
      <div className="ap-file-info">
        <div className="ap-file-type-pill">{fileType?.toUpperCase()}</div>
        <div className="ap-file-path">{file || 'Documents'}</div>
      </div>
    </div>
  )
}

function AgentPipeline({ agents }) {
  if (!agents?.length) return null
  return (
    <div className="ap-pipeline">
      <div className="ap-pipeline-label">AGENT PIPELINE</div>
      <div className="ap-pipeline-track">
        {agents.map((agent, i) => {
          const meta = AGENT_TYPE_META[agent.agentType] || { icon: '🤖', color: '#7c6af7' }
          return (
            <React.Fragment key={agent.id}>
              <div className={`ap-pipeline-node ${agent.status}`}>
                <div className="ap-pipeline-node-icon" style={{ color: meta.color }}>{meta.icon}</div>
                <div className="ap-pipeline-node-label">{agent.description}</div>
                {agent.status === 'active' && <div className="ap-pipeline-pulse" style={{ background: meta.color }} />}
                {agent.status === 'done' && <div className="ap-pipeline-check">✓</div>}
              </div>
              {i < agents.length - 1 && <div className="ap-pipeline-arrow">→</div>}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────── */
export default function AgentPanel({ settings = {} }) {
  const [prompt, setPrompt]             = useState('')
  const [status, setStatus]             = useState('connecting')
  const [thoughts, setThoughts]         = useState('')
  const [response, setResponse]         = useState('')
  const [subagents, setSubagents]       = useState([])
  const [logs, setLogs]                 = useState([])
  const [wakeEnabled, setWakeEnabled]   = useState(true)
  const [isListening, setIsListening]   = useState(false)
  const [searchResults, setSearchResults] = useState(null)
  const [fileCreated, setFileCreated]   = useState(null)
  const [currentIntent, setCurrentIntent] = useState(null)
  const [showLogs, setShowLogs]         = useState(false)
  const [micError, setMicError]         = useState(null)

  const endThoughtsRef  = useRef(null)
  const endResponseRef  = useRef(null)
  const inputRef        = useRef(null)

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    
    const cleanText = text
      .replace(/\*+/g, '')
      .replace(/#+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim()

    if (!cleanText) return

    const utterance = new SpeechSynthesisUtterance(cleanText)
    const voices = window.speechSynthesis.getVoices()
    const profile = settings.voiceProfile || 'Default'
    
    let selectedVoice = null
    if (profile === 'Male') {
      selectedVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('google us english male'))
    } else if (profile === 'Female') {
      selectedVoice = voices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('google us english female') || v.name.toLowerCase().includes('samantha'))
    } else if (profile === 'British') {
      selectedVoice = voices.find(v => v.name.toLowerCase().includes('uk') || v.name.toLowerCase().includes('british') || v.name.toLowerCase().includes('hazel') || v.name.toLowerCase().includes('google uk english'))
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    
    if (profile === 'Robot') {
      utterance.pitch = 0.5
      utterance.rate = 0.85
    } else {
      utterance.pitch = 1.0
      utterance.rate = 1.0
    }
    
    utterance.onstart = () => {
      window.electronAPI?.setVoiceListenerSuspended?.(true)
    }
    utterance.onend = () => {
      window.electronAPI?.setVoiceListenerSuspended?.(false)
    }
    utterance.onerror = () => {
      window.electronAPI?.setVoiceListenerSuspended?.(false)
    }
    
    window.speechSynthesis.speak(utterance)
  }, [settings.voiceProfile])

  /* IPC listener */
  useEffect(() => {
    if (!window.electronAPI?.onAgentMsg) return
    const unsub = window.electronAPI.onAgentMsg((data) => {
      switch (data.type) {
        case 'ready':
          setStatus('online')
          break
        case 'status':
          if (data.state === 'thinking') setStatus('thinking')
          else if (data.state === 'offline') setStatus('offline')
          else if (data.state === 'connecting') setStatus('connecting')
          else if (data.state === 'idle') {
            setStatus('online')
            setIsListening(false)
          } else {
            setStatus('online')
          }
          break
        case 'wake':
          playWakeSound()
          setIsListening(true)
          setLogs(p => [...p, "🎙️ Wake Word 'Hey Clicky' triggered!"])
          setTimeout(() => setIsListening(false), 15000)
          break
        case 'thought':
          setStatus('thinking')
          setThoughts(p => p + data.text)
          break
        case 'response_chunk':
          setStatus('thinking')
          setResponse(p => p + data.text)
          break
        case 'done':
          setStatus('online')
          setResponse(data.text)
          if (settings.soundEnabled) {
            speak(data.text)
          }
          break
        case 'subagent_start':
          setStatus('running')
          setSubagents(p => {
            if (p.some(s => s.id === data.id)) return p
            return [...p, {
              id: data.id,
              description: data.description,
              agentType: data.agent_type || '',
              status: 'active',
            }]
          })
          setLogs(p => [...p, `↳ Spawning: "${data.description}"`])
          break
        case 'tool_call':
          setLogs(p => [...p, `⚙ ${data.name}(${JSON.stringify(data.args || {})})`])
          break
        case 'tool_done':
          setSubagents(p => p.map(s => s.status === 'active' ? { ...s, status: 'done' } : s))
          if (data.result) setLogs(p => [...p, `✓ ${String(data.result).slice(0, 120)}`])
          break
        case 'search_results':
          setSearchResults({ query: data.query, results: data.results })
          break
        case 'file_created':
          setFileCreated({ file: data.file, fileType: data.file_type, title: data.title })
          break
        case 'status_log':
          setLogs(p => [...p, `ℹ ${data.message}`])
          break
        case 'voice_query':
          setIsListening(false)
          setPrompt(data.text)
          setLogs(p => [...p, `🎙️ Heard: "${data.text}"`])
          const voicePromptText = data.text
          setTimeout(() => {
            submitPromptRef.current(voicePromptText)
          }, 800)
          break
        case 'error':
          setStatus('online')
          setLogs(p => [...p, `⚠ Error: ${data.message}`])
          if (data.message && data.message.includes('Microphone')) {
            setMicError(data.message)
          }
          break
        default:
          break
      }
    })
    return () => unsub()
  }, [settings.soundEnabled, speak])

  useEffect(() => { endThoughtsRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thoughts])
  useEffect(() => { endResponseRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [response])

  const submitPrompt = useCallback((text) => {
    if (!text.trim() || status === 'thinking') return

    // Detect current intent for visual feedback
    const pl = text.toLowerCase()
    let intent = null
    if (pl.includes('search') || pl.includes('find online')) intent = 'web_search'
    else if (pl.includes('html') || pl.includes('landing page') || pl.includes('webpage')) intent = 'create_html'
    else if (pl.includes('document') || pl.includes('excel') || pl.includes('word doc')) intent = 'create_document'
    else if (pl.includes('play video') || pl.includes('youtube') || pl.includes('brave')) intent = 'play_video'
    else if (pl.includes('word') || pl.includes('onenote') || pl.includes('outlook') || pl.includes('teams')) intent = 'microsoft_app'
    else if (pl.includes('orchestrate') || pl.includes('multi agent')) intent = 'multi_agent'
    else if (pl.includes('git')) intent = 'git'
    setCurrentIntent(intent)

    setThoughts('')
    setResponse('')
    setSubagents([])
    setLogs([`▶ "${text}"`])
    setSearchResults(null)
    setFileCreated(null)
    setStatus('thinking')
    setIsListening(false)
    window.electronAPI.sendAgentPrompt(text)
    setPrompt('')
    inputRef.current?.focus()
  }, [status])

  const submitPromptRef = useRef(submitPrompt)
  useEffect(() => {
    submitPromptRef.current = submitPrompt
  })

  const handleSend = useCallback((e) => {
    e?.preventDefault()
    submitPrompt(prompt)
  }, [prompt, submitPrompt])

  const handleToggleWake = () => {
    const next = !wakeEnabled
    setWakeEnabled(next)
    window.electronAPI?.setWakeWord?.(next)
    setLogs(p => [...p, `Voice wake: ${next ? 'ON' : 'OFF'}`])
    if (next) setMicError(null)
  }

  const intentMeta = currentIntent ? INTENT_META[currentIntent] : null
  const isThinking = status === 'thinking' || status === 'running'

  /* Quick-action chips */
  const quickActions = [
    { label: '🌐 Search web', prompt: 'search the web for ' },
    { label: '🎨 Create HTML', prompt: 'create a landing page for ' },
    { label: '📊 Create slides', prompt: 'create a presentation about ' },
    { label: '📄 Create doc', prompt: 'create a markdown document: ' },
    { label: '▶️ Play video', prompt: 'play video on YouTube in Brave: ' },
    { label: '🖥️ Open Word', prompt: 'open Microsoft Word' },
    { label: '🤖 Run agents', prompt: 'orchestrate agents to research and create: ' },
    { label: '📁 Git status', prompt: 'show git status' },
    { label: '❓ Help', prompt: 'help' },
  ]

  return (
    <div className="cc-agent-container">
      {micError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: '12px',
          padding: '10px 14px',
          fontSize: '11px',
          color: '#f87171',
          margin: '0 0 12px 0',
          lineHeight: '1.45',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: '13px', flexShrink: 0 }}>⚠️</span>
          <span>{micError}</span>
        </div>
      )}
      {/* ── Header ── */}
      <div className="cc-agent-header">
        <div className="cc-agent-status">
          <span
            className={`cc-agent-dot ${
              isListening
                ? 'thinking'
                : isThinking
                ? 'thinking'
                : status === 'online'
                ? 'online'
                : status === 'connecting'
                ? 'connecting'
                : 'offline'
            }`}
          />
          {isListening
            ? '🎙️ Listening...'
            : status === 'connecting'
            ? '⚡ Connecting...'
            : status === 'offline'
            ? '❌ Offline'
            : status === 'running'
            ? `🤖 Orchestrating ${subagents.length} agents...`
            : isThinking
            ? '⚡ Executing...'
            : intentMeta
            ? `${intentMeta.icon} ${intentMeta.label} ready`
            : '✓ Clicky Ready'}
        </div>
        <label className="ap-wake-toggle" title="Toggle voice wake word">
          <span className={`ap-wake-pill ${wakeEnabled ? 'on' : ''}`} onClick={handleToggleWake}>
            <span className="ap-wake-thumb" />
          </span>
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Hey Clicky</span>
        </label>
      </div>

      {/* ── Thought stream ── */}
      {thoughts && (
        <div className="agent-thought-container">
          <div className="agent-thought-title">
            <span className="ap-thinking-dot" /> Thinking
          </div>
          <div className="agent-thought-text">
            {thoughts}
            <div ref={endThoughtsRef} />
          </div>
        </div>
      )}

      {/* ── Agent pipeline timeline ── */}
      {subagents.length > 0 && <AgentPipeline agents={subagents} />}

      {/* ── Search result cards ── */}
      {searchResults && (
        <SearchResultCard results={searchResults.results} query={searchResults.query} />
      )}

      {/* ── File created card ── */}
      {fileCreated && (
        <FileCreatedCard
          file={fileCreated.file}
          fileType={fileCreated.fileType}
          title={fileCreated.title}
        />
      )}

      {/* ── Response box ── */}
      {response && (
        <div className="agent-output-box">
          <div className="ap-response-label">
            {intentMeta && <span>{intentMeta.icon}</span>} Response
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.55 }}>
            {response}
            <div ref={endResponseRef} />
          </div>
        </div>
      )}

      {/* ── System log (collapsed) ── */}
      {logs.length > 0 && (
        <div className="ap-log-section">
          <button
            className="ap-log-toggle"
            onClick={() => setShowLogs(v => !v)}
          >
            <span>System Log ({logs.length})</span>
            <span style={{ fontSize: 10 }}>{showLogs ? '▲' : '▼'}</span>
          </button>
          {showLogs && (
            <div className="ap-log-body">
              {logs.map((log, i) => (
                <div key={i} className="ap-log-line">{log}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Quick action chips ── */}
      {!isThinking && !response && (
        <div className="ap-quick-actions">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              className="ap-quick-chip"
              onClick={() => {
                setPrompt(qa.prompt)
                inputRef.current?.focus()
              }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Prompt input ── */}
      <form
        onSubmit={handleSend}
        className="cc-agent-prompt-box"
        style={{
          borderColor: isListening ? '#3b82f6' : intentMeta ? intentMeta.color + '55' : undefined,
          boxShadow: isListening ? '0 0 10px rgba(59,130,246,0.4)' : undefined,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            isListening
              ? 'Listening… speak or type'
              : 'Ask Clicky — search web, create HTML, open Word, play video…'
          }
          className="cc-agent-input"
          disabled={isThinking}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend(e)}
        />
        <button
          type="submit"
          disabled={!prompt.trim() || isThinking}
          className="cc-agent-send-btn"
          aria-label="Send"
        >
          {isThinking ? '…' : '➔'}
        </button>
      </form>
    </div>
  )
}
