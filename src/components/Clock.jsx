import { useState, useEffect } from 'react'

export default function Clock({ mini = false, settings = {} }) {
  const [now, setNow] = useState(new Date())

  // Only minutes are ever displayed, so tick on the minute boundary instead of
  // re-rendering the whole notch once a second.
  useEffect(() => {
    let timeoutId = null
    const scheduleNextTick = () => {
      const current = new Date()
      const msToNextMinute = 60000 - (current.getSeconds() * 1000 + current.getMilliseconds())
      timeoutId = setTimeout(() => {
        setNow(new Date())
        scheduleNextTick()
      }, msToNextMinute)
    }
    scheduleNextTick()
    return () => { if (timeoutId) clearTimeout(timeoutId) }
  }, [])

  if (mini) {
    return (
      <time className="clock-mini" dateTime={now.toISOString()}>
        {formatMini(now, settings.use24h !== false)}
      </time>
    )
  }

  const { time, ampm } = formatFull(now, settings.use24h !== false)
  return (
    <div className="clock-expanded">
      <time className="clock-time" dateTime={now.toISOString()}>
        {time}<span className="clock-ampm">{ampm}</span>
      </time>
      <div className="clock-date">{formatDate(now)}</div>
    </div>
  )
}

function formatMini(date, use24h) {
  let h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
  if (use24h) return `${h.toString().padStart(2, '0')}:${m}`
  
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

function formatFull(date, use24h) {
  let h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
  if (use24h) return { time: `${h.toString().padStart(2, '0')}:${m}`, ampm: '' }
  
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return { time: `${h}:${m}`, ampm }
}

function formatDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`
}
