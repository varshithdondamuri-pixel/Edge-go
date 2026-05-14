export default function VolumeHUD({ visible, level }) {
  const icon = level === 0 ? '🔇' : level < 35 ? '🔈' : level < 70 ? '🔉' : '🔊'

  return (
    <div
      className={`volume-hud ${visible ? 'visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`Volume ${level}%`}
    >
      <span className="vhud-icon">{icon}</span>
      <div className="vhud-track">
        <div
          className="vhud-fill"
          style={{ width: `${level}%` }}
        />
      </div>
      <span className="vhud-pct">{level}%</span>
    </div>
  )
}
