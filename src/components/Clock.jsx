import { useState, useEffect } from 'react'

export default function Clock({ mini = false }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (mini) {
    return (
      <time className="clock-mini" dateTime={now.toISOString()}>
        {formatMini(now)}
      </time>
    )
  }

  const { time, ampm } = formatFull(now)
  return (
    <div className="clock-expanded">
      <time className="clock-time" dateTime={now.toISOString()}>
        {time}<span className="clock-ampm">{ampm}</span>
      </time>
      <div className="clock-date">{formatDate(now)}</div>
    </div>
  )
}

function formatMini(date) {
  let h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

function formatFull(date) {
  let h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
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
