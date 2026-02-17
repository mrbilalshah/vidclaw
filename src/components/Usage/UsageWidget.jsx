import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Zap, ChevronDown, Coins, Hash, Cpu, AlertTriangle } from 'lucide-react'

function formatTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

function formatCost(n) {
  if (!n) return '$0.00'
  return '$' + n.toFixed(2)
}

function ProgressBar({ label, percent, resetsIn, tokens, cost }) {
  const barColor = percent > 80 ? 'bg-red-500' : percent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="text-muted-foreground">Resets {resetsIn}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.max(1, percent)}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-foreground w-10 text-right">{percent}%</span>
      </div>
      {(tokens != null || cost != null) && (
        <div className="flex gap-3 text-[9px] text-muted-foreground">
          {tokens != null && <span className="flex items-center gap-0.5"><Hash size={8} />{formatTokens(tokens)} tokens</span>}
          {cost != null && <span className="flex items-center gap-0.5"><Coins size={8} />{formatCost(cost)}</span>}
        </div>
      )}
    </div>
  )
}

export default function UsageWidget() {
  const [usage, setUsage] = useState(null)
  const [openclawUsage, setOpenclawUsage] = useState(null)
  const [openclawError, setOpenclawError] = useState(null)
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [restartNote, setRestartNote] = useState(false)

  const fetchUsage = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch VidClaw's own usage data (from session files)
      const res = await fetch('/api/usage')
      setUsage(await res.json())
    } catch {}
    try {
      // Fetch live data from OpenClaw's native API
      const res = await fetch('/api/openclaw/usage')
      if (res.ok) {
        const data = await res.json()
        setOpenclawUsage(data)
        setOpenclawError(null)
      } else {
        const err = await res.json().catch(() => ({}))
        // If the hint says local data is available, just silently use local data
        if (err.hint) {
          setOpenclawUsage(null)
          setOpenclawError(null) // suppress warning — local data is working
        } else {
          setOpenclawError(err.detail || 'Could not reach OpenClaw')
        }
      }
    } catch (e) {
      // Network error — OpenClaw likely not running; silently fall back to local data
      setOpenclawUsage(null)
      setOpenclawError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchUsage()
    fetch('/api/models').then(r => r.json()).then(setModels).catch(() => {})
    const iv = setInterval(fetchUsage, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [fetchUsage])

  const switchModel = async (model) => {
    try {
      await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      setRestartNote(true)
      fetchUsage()
    } catch {}
  }

  if (!usage) return null

  // Prefer OpenClaw API model if available, fall back to config file
  const ocModel = openclawUsage?.model || openclawUsage?.activeModel
  const displayModel = (ocModel || usage.model || 'unknown').replace('anthropic/', '').replace('google/', '')

  // Merge usage tiers: prefer OpenClaw live data if available
  const tiers = openclawUsage?.tiers || openclawUsage?.rateLimits || usage.tiers || []
  const sessionPct = tiers[0]?.percent ?? 0

  // Color for collapsed pill
  const pillColor = sessionPct > 80 ? 'text-red-400' : sessionPct > 60 ? 'text-amber-400' : 'text-emerald-400'

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 bg-secondary/50 hover:bg-secondary/70 rounded-full px-4 py-1.5 text-xs transition-colors"
      >
        <Zap size={12} className="text-orange-400 shrink-0" />
        <span className="text-muted-foreground text-[10px]">{displayModel}</span>
        <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${sessionPct > 80 ? 'bg-red-500' : sessionPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.max(1, sessionPct)}%` }}
          />
        </div>
        <span className={`text-[10px] font-medium ${pillColor}`}>{sessionPct}%</span>
        <ChevronDown size={10} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        <div onClick={e => { e.stopPropagation(); fetchUsage(); }} className="hover:text-orange-400 transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </div>
      </button>

      {expanded && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-xl p-4 z-50 space-y-4">
          {/* OpenClaw connection status */}
          {openclawError && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 rounded-md px-2 py-1.5">
              <AlertTriangle size={10} className="shrink-0" />
              <span>{openclawError}</span>
            </div>
          )}

          {/* Active Model */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Active Model</label>
            <div className="flex items-center gap-2">
              <Cpu size={12} className="text-orange-400" />
              <span className="text-sm font-medium text-foreground">{displayModel}</span>
              {openclawUsage && <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">live</span>}
            </div>
            {models.length > 0 && (
              <select
                value={ocModel || ('anthropic/' + usage.model)}
                onChange={e => switchModel(e.target.value)}
                className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-orange-500 mt-1"
              >
                {models.map(m => (
                  <option key={m} value={m}>{m.replace('anthropic/', '').replace('google/', '')}</option>
                ))}
              </select>
            )}
            {restartNote && (
              <p className="text-[10px] text-green-400">Model updated — takes effect on next session</p>
            )}
          </div>

          {/* Usage tiers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Usage</div>
              {openclawUsage && <span className="text-[9px] text-muted-foreground">via OpenClaw API</span>}
            </div>
            {tiers.map((tier, i) => (
              <ProgressBar key={tier.label || i} {...tier} />
            ))}
          </div>

          {/* Raw OpenClaw data if available */}
          {openclawUsage && !openclawUsage.tiers && !openclawUsage.rateLimits && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">OpenClaw Raw</div>
              <pre className="text-[9px] font-mono text-muted-foreground bg-secondary/50 rounded-md p-2 max-h-32 overflow-auto">
                {JSON.stringify(openclawUsage, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
