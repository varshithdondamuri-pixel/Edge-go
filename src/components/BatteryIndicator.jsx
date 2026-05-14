export default function BatteryIndicator({ battery }) {
  const { level, charging, available } = battery

  if (!available && level === 100) {
    // Likely a desktop with no battery — show plug icon
    return (
      <div className="battery-expanded">
        <span className="battery-plug">🔌</span>
        <span className="battery-label">Plugged In</span>
      </div>
    )
  }

  const colorClass = level > 60 ? 'high' : level > 20 ? 'mid' : 'low'

  return (
    <div className="battery-expanded">
      {charging && <span className="bolt-exp" title="Charging">⚡</span>}
      <div className="battery-bar-outer" title={`${level}%`}>
        <div
          className={`battery-bar-inner ${colorClass}`}
          style={{ width: `${level}%` }}
        />
      </div>
      <span className="battery-label">
        {charging ? `${level}% ·` : `${level}%`}
        {charging && <span className="charging-text"> Charging</span>}
      </span>
    </div>
  )
}
