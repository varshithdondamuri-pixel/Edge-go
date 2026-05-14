export default function CalendarMini() {
  const today = new Date()

  // Build 7 days: -2 before today to +4 after today
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - 2 + i)
    return {
      date: d.getDate(),
      dayName: ['S','M','T','W','T','F','S'][d.getDay()],
      isToday: i === 2,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      fullLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    }
  })

  return (
    <div className="calendar-mini">
      <div className="cal-month-label">
        {today.toLocaleString('default', { month: 'short' }).toUpperCase()}
      </div>
      <div className="cal-days" role="grid" aria-label="Current week">
        {days.map((d, i) => (
          <div
            key={i}
            className={`cal-day${d.isToday ? ' today' : ''}${d.isWeekend && !d.isToday ? ' weekend' : ''}`}
            role="gridcell"
            title={d.fullLabel}
            aria-label={d.fullLabel + (d.isToday ? ' (today)' : '')}
          >
            {d.date}
          </div>
        ))}
      </div>
    </div>
  )
}
