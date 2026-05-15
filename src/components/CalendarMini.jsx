export default function CalendarMini() {
  const today = new Date()
  const monthName = today.toLocaleString('default', { month: 'long' })
  const year = today.getFullYear()

  // 7 days window: -2 before today to +4 after
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - 2 + i)
    return {
      date: d.getDate(),
      dayName: ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()],
      isToday: i === 2,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      fullLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    }
  })

  return (
    <div className="calendar-mini">
      {/* Month + year label */}
      <div className="cal-month-row">
        <span className="cal-month-label">{monthName}</span>
        <span className="cal-year-label">{year}</span>
      </div>

      {/* Day name headers */}
      <div className="cal-days-grid">
        <div className="cal-day-names" role="row" aria-label="Day names">
          {days.map((d, i) => (
            <div key={i} className={`cal-day-name${d.isWeekend ? ' weekend' : ''}`}>
              {d.dayName}
            </div>
          ))}
        </div>

        {/* Date numbers */}
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
    </div>
  )
}
