export default function CalendarMini({ settings = {} }) {
  const today = new Date()
  const locale = getCalendarLocale(settings.language)
  const monthName = today.toLocaleString(locale, { month: 'long' })
  const year = today.getFullYear()
  const startOfWeek = new Date(today)
  const firstDay = settings.weekStartsMonday ? 1 : 0
  const dayOffset = (today.getDay() - firstDay + 7) % 7
  startOfWeek.setDate(today.getDate() - dayOffset)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    return {
      date: d.getDate(),
      dayName: d.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2),
      isToday: d.toDateString() === today.toDateString(),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      fullLabel: d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }),
    }
  })

  return (
    <div className="calendar-mini">
      {/* Month + year label */}
      <div className="cal-month-row">
        <span className="cal-month-label">{monthName}</span>
        <span className="cal-year-label">{year}</span>
        {settings.showWeekNumbers && <span className="cal-week-number">W{getWeekNumber(today)}</span>}
      </div>

      {/* Day name headers */}
      <div className="cal-days-grid">
        {settings.showDayNames !== false && (
          <div className="cal-day-names" role="row" aria-label="Day names">
            {days.map((d, i) => (
              <div key={i} className={`cal-day-name${d.isWeekend ? ' weekend' : ''}`}>
                {d.dayName}
              </div>
            ))}
          </div>
        )}

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

function getCalendarLocale(language) {
  const map = {
    en: 'en-US',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
  }
  return map[language] || 'en-US'
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}
