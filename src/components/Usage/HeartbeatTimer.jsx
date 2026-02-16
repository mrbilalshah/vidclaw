import React, { useState, useEffect } from 'react'
import { HeartPulse } from 'lucide-react'

const INTERVAL_MS = 30 * 60 * 1000 // 30 minutes (heartbeat interval)

export default function HeartbeatTimer() {
  const [lastBeat, setLastBeat] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const stored = localStorage.getItem('lastHeartbeat')
    if (stored) setLastBeat(parseInt(stored))

    const iv = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    async function checkBeat() {
      try {
        const res = await fetch('/api/heartbeat')
        if (res.ok) {
          const data = await res.json()
          if (data.lastHeartbeat) {
            setLastBeat(data.lastHeartbeat)
            localStorage.setItem('lastHeartbeat', data.lastHeartbeat.toString())
          }
        }
      } catch {}
    }
    checkBeat()
    const iv = setInterval(checkBeat, 30000)
    return () => clearInterval(iv)
  }, [])

  if (!lastBeat) return null

  const nextBeat = lastBeat + INTERVAL_MS
  const remaining = Math.max(0, nextBeat - now)
  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)

  let label
  if (minutes < 1) label = '<1m'
  else label = `${minutes}m`

  const isImminent = minutes < 1

  return (
    <div className="relative group flex items-center gap-1 text-[10px] text-muted-foreground cursor-default">
      <HeartPulse size={11} className={isImminent ? 'text-orange-400 animate-pulse' : ''} />
      <span>{label}</span>
      <div className="absolute top-full right-0 mt-1.5 px-2 py-1 bg-popover border border-border rounded text-[10px] text-popover-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-[9999]">
        Next execution window in {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
      </div>
    </div>
  )
}
