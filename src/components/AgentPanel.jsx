import React, { useState, useEffect, useRef } from 'react'

export default function AgentPanel() {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('online') // online | thinking | running
  const [thoughts, setThoughts] = useState('')
  const [response, setResponse] = useState('')
  const [subagents, setSubagents] = useState([])
  const [logs, setLogs] = useState([])
  const [wakeEnabled, setWakeEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  
  const endThoughtsRef = useRef(null)
  const endResponseRef = useRef(null)

  // Web Audio API rising futuristic chime for wake word activation
  const playWakeSound = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      
      osc.type = 'sine'
      // Futuristic ascending chime: C5 -> E5 -> G5 -> C6
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
    } catch (e) {
      console.warn('[AgentPanel] Audio chime error:', e)
    }
  }

  useEffect(() => {
    if (!window.electronAPI?.onAgentMsg) return

    const unsubscribe = window.electronAPI.onAgentMsg((data) => {
      if (data.type === 'ready') {
        setStatus('online')
      } else if (data.type === 'status') {
        if (data.state === 'thinking') {
          setStatus('thinking')
          setIsListening(false)
        } else if (data.state === 'idle') {
          setStatus('online')
        }
      } else if (data.type === 'wake') {
        // Wake word triggered!
        playWakeSound()
        setIsListening(true)
        setLogs((prev) => [...prev, "🎙️ Wake Word 'Hey Clicky' triggered!"])
        // Automatically close listening state if no speech recognized within 5s
        setTimeout(() => {
          setIsListening(false)
        }, 5000)
      } else if (data.type === 'thought') {
        setStatus('thinking')
        setThoughts((prev) => prev + data.text)
      } else if (data.type === 'response_chunk') {
        setStatus('thinking')
        setResponse((prev) => prev + data.text)
      } else if (data.type === 'done') {
        setStatus('online')
        setResponse(data.text)
      } else if (data.type === 'subagent_start') {
        setStatus('running')
        setSubagents((prev) => {
          if (prev.some((s) => s.id === data.id)) return prev
          return [...prev, { id: data.id, description: data.description, status: 'active' }]
        })
        setLogs((prev) => [...prev, `Spawning subagent: "${data.description}"`])
      } else if (data.type === 'tool_call') {
        setLogs((prev) => [...prev, `Tool Call: ${data.name}(${JSON.stringify(data.args)})`])
      } else if (data.type === 'tool_done') {
        setSubagents((prev) =>
          prev.map((s) => (s.status === 'active' ? { ...s, status: 'done' } : s))
        )
        setLogs((prev) => [...prev, `Tool executed: success`])
      } else if (data.type === 'status_log') {
        setLogs((prev) => [...prev, `System: ${data.message}`])
      } else if (data.type === 'error') {
        setStatus('online')
        setLogs((prev) => [...prev, `⚠️ Error: ${data.message}`])
      }
    })

    return () => unsubscribe()
  }, [])

  // Auto-scroll thoughts and responses
  useEffect(() => {
    endThoughtsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thoughts])

  useEffect(() => {
    endResponseRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [response])

  const handleSend = (e) => {
    e.preventDefault()
    if (!prompt.trim() || status === 'thinking') return

    setThoughts('')
    setResponse('')
    setSubagents([])
    setLogs([`Sending command: "${prompt}"`])
    setStatus('thinking')
    setIsListening(false)

    window.electronAPI.sendAgentPrompt(prompt)
    setPrompt('')
  }

  const handleToggleWake = () => {
    const nextVal = !wakeEnabled
    setWakeEnabled(nextVal)
    if (window.electronAPI?.setWakeWord) {
      window.electronAPI.setWakeWord(nextVal)
    }
    setLogs((prev) => [...prev, `Voice wake word: ${nextVal ? 'ON' : 'OFF'}`])
  }

  return (
    <div className="cc-agent-container">
      {/* Header / Config Toggles */}
      <div className="cc-agent-header">
        <div className="cc-agent-status">
          <span 
            className={`cc-agent-dot ${isListening ? 'thinking' : status === 'thinking' ? 'thinking' : 'online'}`}
            style={{ backgroundColor: isListening ? '#3b82f6' : undefined }}
          />
          {isListening ? '🎙️ Listening...' : status === 'thinking' ? 'Agent: Thinking...' : status === 'running' ? 'Agent: Orchestrating Subagents' : 'Agent: Ready'}
        </div>
        
        {/* Toggle Switch */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={wakeEnabled}
            onChange={handleToggleWake}
            style={{ cursor: 'pointer' }}
          />
          Wake Word "Hey Clicky"
        </label>
      </div>

      {/* Thought stream container */}
      {thoughts && (
        <div className="agent-thought-container">
          <div className="agent-thought-title">Agent Thought Process</div>
          <div className="agent-thought-text">
            {thoughts}
            <div ref={endThoughtsRef} />
          </div>
        </div>
      )}

      {/* Subagents spawned list */}
      {subagents.length > 0 && (
        <div className="agent-subagents-section">
          <div className="agent-subagents-title">Active Subtasks / Agents</div>
          <div className="agent-subagent-cards">
            {subagents.map((sub) => (
              <div 
                key={sub.id} 
                className={`agent-subagent-card ${sub.status === 'active' ? 'active' : ''}`}
              >
                <span className="agent-subagent-icon">⚙️</span>
                <span className="agent-subagent-text">{sub.description}</span>
                <span className="agent-subagent-status">{sub.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final response box */}
      {response && (
        <div className="agent-output-box">
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Response:</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {response}
            <div ref={endResponseRef} />
          </div>
        </div>
      )}

      {/* Logs and tool calls */}
      {logs.length > 0 && (
        <div className="cc-media-section" style={{ padding: '8px 12px', borderStyle: 'dashed' }}>
          <div className="cc-media-header" style={{ fontSize: '9px', marginBottom: '2px' }}>
            System Log
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', maxHeight: '60px', overflowY: 'auto' }}>
            {logs.map((log, index) => (
              <div key={index} style={{ marginBottom: '2px' }}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt input field - glows blue with breathing effect when Listening */}
      <form 
        onSubmit={handleSend} 
        className="cc-agent-prompt-box"
        style={{ 
          borderColor: isListening ? '#3b82f6' : undefined,
          boxShadow: isListening ? '0 0 10px rgba(59, 130, 246, 0.4)' : undefined,
          animation: isListening ? 'agentPulse 1s infinite alternate' : undefined
        }}
      >
        <input 
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={isListening ? "Listening... Speak or type prompt" : "Ask Clicky (e.g. click at coordinates, show git status)..."}
          className="cc-agent-input"
          disabled={status === 'thinking'}
        />
        <button 
          type="submit" 
          disabled={!prompt.trim() || status === 'thinking'}
          className="cc-agent-send-btn"
          aria-label="Send prompt"
        >
          ➔
        </button>
      </form>
    </div>
  )
}
