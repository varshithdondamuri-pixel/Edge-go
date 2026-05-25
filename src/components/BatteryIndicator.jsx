export default function BatteryIndicator({ battery, settings = {} }) {
  const { level, charging, available } = battery

  if (!available) {
    return null
  }

  const colorClass = level > 60 ? 'high' : level > 20 ? 'mid' : 'low'

  return (
    <div className="battery-expanded">
      {settings.showPowerIcons !== false && charging && <span className="bolt-exp" title="Charging">⚡</span>}
      <div className="battery-bar-outer" title={`${level}%`}>
        <div
          className={`battery-bar-inner ${colorClass}`}
          style={{ width: `${level}%` }}
        />
      </div>
      {settings.showBatteryPct !== false && (
        <span className="battery-label">
          {charging ? `${level}% ·` : `${level}%`}
          {charging && <span className="charging-text"> Charging</span>}
        </span>
      )}
    </div>
  )
}
