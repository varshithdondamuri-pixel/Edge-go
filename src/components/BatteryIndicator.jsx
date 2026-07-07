export default function BatteryIndicator({ battery, settings = {} }) {
  const {
    level = 100,
    charging = false,
    available = false,
    acConnected = false,
    timeRemaining = '',
  } = battery || {}

  if (!available) {
    return null
  }

  const colorClass = level > 60 ? 'high' : level > 20 ? 'mid' : 'low'
  const isPluggedIn = charging || acConnected

  return (
    <div className="battery-expanded">
      {settings.showPowerIcons !== false && isPluggedIn && (
        <span className="bolt-exp" title={charging ? 'Charging' : 'Plugged In'}>⚡</span>
      )}
      <div className="battery-bar-outer" title={`${level}%`}>
        <div
          className={`battery-bar-inner ${colorClass}`}
          style={{ width: `${level}%` }}
        />
      </div>
      {settings.showBatteryPct !== false && (
        <span className="battery-label">
          {level}%
          {charging && <span className="charging-text"> · Charging</span>}
          {!charging && acConnected && <span className="charging-text" style={{ color: 'var(--color-text-secondary)' }}> · Plugged In</span>}
          {timeRemaining && <span className="battery-remaining" style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}> · {timeRemaining} remaining</span>}
        </span>
      )}
    </div>
  )
}
