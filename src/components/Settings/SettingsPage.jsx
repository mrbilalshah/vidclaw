import React, { useState, useEffect } from 'react'
import { Settings, Clock, Save, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const HEARTBEAT_OPTIONS = [
  { value: '5m', label: '5 minutes' },
  { value: '10m', label: '10 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
]

export default function SettingsPage() {
  const [heartbeat, setHeartbeat] = useState('30m')
  const [savedHeartbeat, setSavedHeartbeat] = useState('30m')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const isDirty = heartbeat !== savedHeartbeat

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        setHeartbeat(d.heartbeatEvery || '30m')
        setSavedHeartbeat(d.heartbeatEvery || '30m')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heartbeatEvery: heartbeat }),
      })
      if (!r.ok) throw new Error('Save failed')
      setSavedHeartbeat(heartbeat)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading settings…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Settings size={20} className="text-primary" />
        <h2 className="text-lg font-semibold">Settings</h2>
      </div>

      {/* Heartbeat Section */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-orange-400" />
          <h3 className="font-medium text-sm">Heartbeat Frequency</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          How often the agent checks in. Lower values mean faster responses but more API usage.
        </p>
        <div className="flex flex-wrap gap-2">
          {HEARTBEAT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setHeartbeat(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm border transition-colors',
                heartbeat === opt.value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            isDirty
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? 'Saving…' : saved ? 'Saved & Restarting' : 'Save'}
        </button>
        {saved && (
          <span className="text-xs text-green-400">OpenClaw is restarting with new settings…</span>
        )}
      </div>
    </div>
  )
}
