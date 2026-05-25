import { useState, useEffect, useRef } from 'react'

const MAX_HISTORY = 10
const isElectron = !!window.electronAPI

// eslint-disable-next-line no-unused-vars
export default function SystemMonitor({ settings = {} }) {
  const [cpu, setCpu] = useState(0)
  const [ram, setRam] = useState({ used: 0, total: 1 })
  const [cpuHistory, setCpuHistory] = useState(Array(MAX_HISTORY).fill(0))
  const [ramHistory, setRamHistory] = useState(Array(MAX_HISTORY).fill(0))
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    const fetch = async () => {
      if (!isElectron || !window.electronAPI.getSystemUsage) return
      try {
        const data = await window.electronAPI.getSystemUsage()
        if (!isMounted.current || !data) return
        const cpuVal = Math.min(100, Math.max(0, data.cpu ?? 0))
        const ramUsed = data.ramUsed ?? 0
        const ramTotal = data.ramTotal ?? 1
        setCpu(cpuVal)
        setRam({ used: ramUsed, total: ramTotal })
        setCpuHistory(h => [...h.slice(1), cpuVal])
        setRamHistory(h => [...h.slice(1), Math.round((ramUsed / ramTotal) * 100)])
      } catch {}
    }
    fetch()
    const id = setInterval(fetch, 3000)
    return () => { isMounted.current = false; clearInterval(id) }
  }, [])

  const ramPct = ram.total > 0 ? Math.round((ram.used / ram.total) * 100) : 0
  const ramLabel = `${ram.used.toFixed(1)} / ${ram.total.toFixed(1)} GB`

  return (
    <div className="sys-monitor">
      <div className="sm-header">
        <span className="sm-icon">📊</span>
        <span className="sm-label">System</span>
      </div>

      {/* CPU */}
      <div className="sm-row">
        <div className="sm-row-left">
          <span className="sm-metric-label">CPU</span>
          <MiniSparkline history={cpuHistory} color="var(--color-accent)" />
        </div>
        <div className="sm-row-right">
          <div className="sm-bar-outer">
            <div
              className="sm-bar-fill"
              style={{
                width: `${cpu}%`,
                background: cpu > 80
                  ? 'var(--color-danger)'
                  : cpu > 50
                    ? 'var(--color-warning)'
                    : 'var(--color-accent)',
              }}
            />
          </div>
          <span className="sm-pct">{cpu}%</span>
        </div>
      </div>

      {/* RAM */}
      <div className="sm-row">
        <div className="sm-row-left">
          <span className="sm-metric-label">RAM</span>
          <MiniSparkline history={ramHistory} color="#f472b6" />
        </div>
        <div className="sm-row-right">
          <div className="sm-bar-outer">
            <div
              className="sm-bar-fill"
              style={{
                width: `${ramPct}%`,
                background: ramPct > 85
                  ? 'var(--color-danger)'
                  : ramPct > 60
                    ? 'var(--color-warning)'
                    : '#f472b6',
              }}
            />
          </div>
          <span className="sm-pct">{ramLabel}</span>
        </div>
      </div>
    </div>
  )
}

function MiniSparkline({ history, color }) {
  const max = Math.max(...history, 1)
  return (
    <div className="sm-sparkline" aria-hidden="true">
      {history.map((v, i) => (
        <div
          key={i}
          className="sm-spark-bar"
          style={{
            height: `${Math.max(2, (v / max) * 14)}px`,
            background: color,
            opacity: 0.4 + (i / history.length) * 0.6,
          }}
        />
      ))}
    </div>
  )
}
