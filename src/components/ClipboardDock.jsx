import { useState, useEffect, useCallback } from 'react'

const MAX_ITEMS = 8

// Mock clipboard history — in Electron this would be populated via clipboard API polling
const INITIAL_CLIPS = [
  { id: 1, text: 'https://open.spotify.com/track/blinding-lights', type: 'url', time: '2m ago' },
  { id: 2, text: 'npm install @radix-ui/react-dialog', type: 'code', time: '5m ago' },
  { id: 3, text: 'Meeting at 3:00 PM — Conference Room B', type: 'text', time: '12m ago' },
  { id: 4, text: 'varshith@email.com', type: 'email', time: '18m ago' },
  { id: 5, text: 'git commit -m "feat: add notch connectors"', type: 'code', time: '25m ago' },
]

function detectType(text) {
  if (/^https?:\/\//.test(text)) return 'url'
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(text)) return 'email'
  if (/^(npm |git |cd |ls |yarn |pip )/.test(text)) return 'code'
  return 'text'
}

function typeIcon(type) {
  switch (type) {
    case 'url':   return '🔗'
    case 'code':  return '⌨️'
    case 'email': return '✉️'
    default:      return '📋'
  }
}

export default function ClipboardDock({ open, onClose }) {
  const [clips, setClips] = useState(INITIAL_CLIPS)
  const [copied, setCopied] = useState(null)
  const [hovered, setHovered] = useState(null)

  // Poll clipboard in Electron
  useEffect(() => {
    if (!window.electronAPI?.readClipboard) return
    const id = setInterval(async () => {
      try {
        const text = await window.electronAPI.readClipboard()
        if (!text || text.trim().length === 0) return
        setClips(prev => {
          if (prev[0]?.text === text) return prev
          const newItem = { id: Date.now(), text, type: detectType(text), time: 'just now' }
          return [newItem, ...prev].slice(0, MAX_ITEMS)
        })
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const handleCopy = useCallback((clip) => {
    if (window.electronAPI?.writeClipboard) {
      window.electronAPI.writeClipboard(clip.text).catch(() => {})
    } else {
      navigator.clipboard?.writeText(clip.text).catch(() => {})
    }
    setCopied(clip.id)
    setTimeout(() => setCopied(null), 1500)
  }, [])

  const handleDelete = useCallback((id, e) => {
    e.stopPropagation()
    setClips(prev => prev.filter(c => c.id !== id))
  }, [])

  const handleClearAll = () => setClips([])

  if (!open) return null

  return (
    <>
      <div className="clip-backdrop" onClick={onClose} />
      <div className="clip-dock" role="dialog" aria-label="Clipboard History">
        {/* Header */}
        <div className="clip-header">
          <div className="clip-header-left">
            <span className="clip-icon-badge">📋</span>
            <div>
              <div className="clip-title">Clipboard</div>
              <div className="clip-subtitle">{clips.length} item{clips.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div className="clip-header-actions">
            {clips.length > 0 && (
              <button className="clip-clear-btn" onClick={handleClearAll} title="Clear all">
                <TrashIcon />
              </button>
            )}
            <button className="clip-close-btn" onClick={onClose} aria-label="Close clipboard">✕</button>
          </div>
        </div>

        {/* Items */}
        <div className="clip-list" role="list">
          {clips.length === 0 ? (
            <div className="clip-empty">
              <span className="clip-empty-icon">📭</span>
              <span>Clipboard is empty</span>
            </div>
          ) : (
            clips.map((clip, idx) => (
              <div
                key={clip.id}
                className={`clip-item ${hovered === clip.id ? 'hovered' : ''} ${copied === clip.id ? 'copied' : ''}`}
                role="listitem"
                style={{ animationDelay: `${idx * 40}ms` }}
                onClick={() => handleCopy(clip)}
                onMouseEnter={() => setHovered(clip.id)}
                onMouseLeave={() => setHovered(null)}
                title="Click to copy"
              >
                <div className="clip-item-left">
                  <span className="clip-type-icon">{typeIcon(clip.type)}</span>
                  <div className="clip-item-body">
                    <div className="clip-item-text">{clip.text}</div>
                    <div className="clip-item-meta">
                      <span className={`clip-type-tag clip-type-${clip.type}`}>{clip.type}</span>
                      <span className="clip-time">{clip.time}</span>
                    </div>
                  </div>
                </div>
                <div className="clip-item-right">
                  {copied === clip.id ? (
                    <span className="clip-copied-badge">✓ Copied</span>
                  ) : (
                    <button
                      className="clip-delete-btn"
                      onClick={(e) => handleDelete(clip.id, e)}
                      aria-label="Remove item"
                      title="Remove"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Dock handle */}
        <div className="clip-dock-handle" />
      </div>
    </>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  )
}
