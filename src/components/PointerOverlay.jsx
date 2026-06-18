import React, { useEffect, useState, useRef } from 'react'

export default function PointerOverlay() {
  const [pointer, setPointer] = useState({ x: -100, y: -100, visible: false })
  const [ripple, setRipple] = useState({ x: 0, y: 0, active: false })
  const [actionText, setActionText] = useState('')
  const cursorRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 })

  useEffect(() => {
    if (!window.electronAPI?.onAgentMsg) return

    const unsubscribe = window.electronAPI.onAgentMsg((data) => {
      if (data.type === 'pointer_animation') {
        const { x, y, startX, startY } = data
        triggerPointerMove(x, y, startX, startY)
      }
    })

    return () => unsubscribe()
  }, [])

  const triggerPointerMove = (targetX, targetY, providedStartX, providedStartY) => {
    setActionText('AI Agent: Clicking...')
    setPointer((prev) => ({ ...prev, visible: true }))

    const startX = providedStartX !== undefined ? providedStartX : cursorRef.current.x
    const startY = providedStartY !== undefined ? providedStartY : cursorRef.current.y
    const duration = 1200 // ms
    const startTime = performance.now()

    // Control point for Bezier curve (curved trajectory)
    const controlX = (startX + targetX) / 2 + (Math.random() - 0.5) * 400
    const controlY = Math.min(startX, targetY) - 150

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime
      const t = Math.min(elapsed / duration, 1)

      // Easing function (easeOutCubic)
      const ease = 1 - Math.pow(1 - t, 3)

      // Quadratic Bezier interpolation
      const x = (1 - ease) * (1 - ease) * startX + 2 * (1 - ease) * ease * controlX + ease * ease * targetX
      const y = (1 - ease) * (1 - ease) * startY + 2 * (1 - ease) * ease * controlY + ease * ease * targetY

      setPointer({ x, y, visible: true })

      if (t < 1) {
        requestAnimationFrame(animate)
      } else {
        // Arrived at destination
        cursorRef.current = { x: targetX, y: targetY }
        
        // Trigger click ripple
        setRipple({ x: targetX, y: targetY, active: true })
        setActionText(`Clicking at (${targetX}, ${targetY})`)

        setTimeout(() => {
          setRipple({ x: 0, y: 0, active: false })
        }, 1000)

        // Fade pointer out
        setTimeout(() => {
          setPointer((prev) => ({ ...prev, visible: false }))
          setActionText('')
        }, 1500)
      }
    }

    requestAnimationFrame(animate)
  }

  if (!pointer.visible) return null

  return (
    <div className="pointer-overlay-container">
      {/* Visual Cursor Pointer */}
      <div 
        className="pointer-cursor"
        style={{ 
          transform: `translate(${pointer.x}px, ${pointer.y}px)` 
        }}
      >
        <svg 
          viewBox="0 0 32 32" 
          width="32" 
          height="32" 
          className="pointer-arrow"
        >
          <path 
            fill="#3b82f6" 
            stroke="#ffffff" 
            strokeWidth="2.5" 
            d="M5.5 1.5v25.2l7.2-7.2h10.3L5.5 1.5z"
          />
        </svg>

        {/* Text bubble following cursor */}
        {actionText && (
          <div className="pointer-bubble">
            <span className="pointer-status-dot"></span>
            {actionText}
          </div>
        )}
      </div>

      {/* Ripple effect on click */}
      {ripple.active && (
        <div 
          className="pointer-ripple"
          style={{ 
            left: ripple.x - 30, 
            top: ripple.y - 30 
          }}
        />
      )}
    </div>
  )
}
