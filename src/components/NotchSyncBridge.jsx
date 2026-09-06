import { useState, useEffect } from 'react'

export default function NotchSyncBridge({ open, onClose, settings = {}, onSettingsChange }) {
  const [pendingChanges, setPendingChanges] = useState(null)
  const [statusMsg, setStatusMsg] = useState(null)
  const isElectron = !!window.electronAPI

  useEffect(() => {
    if (open) {
      setStatusMsg('⚡ Sync Bridge Active • Connected to System & Installed Devices')
      const timer = setTimeout(() => setStatusMsg(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Without this the panel could only be dismissed via its ✕ button, which
  // left the notch window stuck at full-screen size if the mouse strayed.
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Clear any transient state when the panel is dismissed
  useEffect(() => {
    if (!open) {
      setPendingChanges(null)
      setStatusMsg(null)
    }
  }, [open])

  if (!open) return null

  const handleApplyChange = (key, value, label) => {
    setPendingChanges({
      key,
      value,
      label,
      title: `Update ${label || key}`,
      details: `Set ${key} to ${JSON.stringify(value)}`,
    })
  }

  const handleConfirmOkay = () => {
    if (!pendingChanges) return
    const { key, value } = pendingChanges
    onSettingsChange(prev => ({ ...prev, [key]: value }))
    setStatusMsg(`✓ Applied & Synced: ${pendingChanges.label || key}`)
    setPendingChanges(null)
    setTimeout(() => setStatusMsg(null), 3000)
  }

  const handleExportProfile = async () => {
    if (isElectron && window.electronAPI.exportProfile) {
      const res = await window.electronAPI.exportProfile(settings)
      if (res?.success) {
        setStatusMsg(`✓ Exported profile to ${res.path.split(/[\\/]/).pop()}`)
        setTimeout(() => setStatusMsg(null), 3500)
      }
    } else {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2))
      const downloadAnchor = document.createElement('a')
      downloadAnchor.setAttribute("href", dataStr)
      downloadAnchor.setAttribute("download", "notch-profile.json")
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      downloadAnchor.remove()
      setStatusMsg(`✓ Downloaded notch-profile.json`)
      setTimeout(() => setStatusMsg(null), 3000)
    }
  }

  const handleImportProfile = async () => {
    if (isElectron && window.electronAPI.importProfile) {
      const res = await window.electronAPI.importProfile()
      if (res?.success && res.profile) {
        setPendingChanges({
          isImport: true,
          profile: res.profile,
          path: res.path,
          title: "Import System Profile",
          details: `Load profile settings from ${res.path.split(/[\\/]/).pop()}?`,
        })
      }
    }
  }

  const handleConfirmImportOkay = () => {
    if (!pendingChanges?.profile) return
    onSettingsChange(pendingChanges.profile)
    setStatusMsg(`✓ System Profile Imported & Applied!`)
    setPendingChanges(null)
    setTimeout(() => setStatusMsg(null), 3500)
  }

  const handleBrowseAndLaunchExe = async () => {
    if (isElectron && window.electronAPI.browseAndLaunchExe) {
      const res = await window.electronAPI.browseAndLaunchExe()
      if (res?.success) {
        setStatusMsg(`✓ Launched: ${res.name || res.path}`)
        setTimeout(() => setStatusMsg(null), 3500)
      }
    }
  }

  return (
    <div className="sync-bridge-backdrop" style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '64px',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div className="sync-bridge-card" style={{
        width: '460px',
        maxWidth: '92vw',
        background: 'rgba(15, 23, 42, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '20px',
        padding: '24px',
        color: '#f8fafc',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        position: 'relative'
      }}>
        {/* Program Launcher */}
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={handleBrowseAndLaunchExe}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(124, 106, 247, 0.25) 0%, rgba(59, 130, 246, 0.25) 100%)',
              border: '1px solid rgba(124, 106, 247, 0.4)',
              color: '#f8fafc',
              padding: '11px 16px',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(124, 106, 247, 0.2)'
            }}
          >
            🚀 Load & Launch .exe Program
          </button>
        </div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🔗</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Notch Sync Controller</h3>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>Direct Notch system bridge & profile sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#94a3b8',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ✕
          </button>
        </div>

        {statusMsg && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '10px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#4ade80',
            marginBottom: '14px',
            textAlign: 'center'
          }}>
            {statusMsg}
          </div>
        )}

        {/* Quick Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>
            SYSTEM CONTROLS & DIRECT TWEAKS
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
            <span style={{ fontSize: '13px' }}>✨ Glow Effect</span>
            <button
              onClick={() => handleApplyChange('glowEffect', !settings.glowEffect, 'Glow Effect')}
              style={{
                background: settings.glowEffect ? '#7c6af7' : 'rgba(255,255,255,0.1)',
                border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
              }}
            >
              {settings.glowEffect ? 'ON' : 'OFF'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
            <span style={{ fontSize: '13px' }}>🔔 Sneak Peek Banner</span>
            <button
              onClick={() => handleApplyChange('sneakPeek', !settings.sneakPeek, 'Sneak Peek Banner')}
              style={{
                background: settings.sneakPeek !== false ? '#7c6af7' : 'rgba(255,255,255,0.1)',
                border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
              }}
            >
              {settings.sneakPeek !== false ? 'ON' : 'OFF'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px' }}>
            <span style={{ fontSize: '13px' }}>🛡️ Agent Permissions</span>
            <button
              onClick={() => handleApplyChange('agentPermissionsEnabled', !settings.agentPermissionsEnabled, 'Agent Permissions')}
              style={{
                background: settings.agentPermissionsEnabled !== false ? '#22c55e' : 'rgba(255,255,255,0.1)',
                border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
              }}
            >
              {settings.agentPermissionsEnabled !== false ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>

        {/* Cross-System Sync */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>
            CROSS-SYSTEM PROFILE SYNC
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleExportProfile}
              style={{
                flex: 1,
                background: 'rgba(124, 106, 247, 0.15)',
                border: '1px solid rgba(124, 106, 247, 0.3)',
                color: '#a78bfa',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              🔗 Export Profile JSON
            </button>
            <button
              onClick={handleImportProfile}
              style={{
                flex: 1,
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                padding: '10px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              📥 Import System Profile
            </button>
          </div>
        </div>

        {/* Confirmation Modal overlay ("Okay / Cancel") */}
        {pendingChanges && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.98)',
            borderRadius: '20px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '16px',
            animation: 'fadeIn 0.15s ease-out',
            zIndex: 20
          }}>
            <div style={{ fontSize: '32px' }}>⚙️</div>
            <div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#f8fafc' }}>
                Confirm System Change?
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', maxWidth: '320px' }}>
                {pendingChanges.details}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '280px', marginTop: '8px' }}>
              <button
                onClick={pendingChanges.isImport ? handleConfirmImportOkay : handleConfirmOkay}
                style={{
                  flex: 1,
                  background: '#22c55e',
                  border: 'none',
                  color: '#fff',
                  padding: '10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px'
                }}
              >
                ✓ Okay
              </button>
              <button
                onClick={() => setPendingChanges(null)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
