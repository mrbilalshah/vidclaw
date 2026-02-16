import React, { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { GripVertical, Pencil, Trash2, Clock, Play, AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'

const priorityColors = {
  low: 'border-l-zinc-500',
  medium: 'border-l-blue-500',
  high: 'border-l-amber-500',
  urgent: 'border-l-red-500',
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function ScheduleBadge({ schedule }) {
  if (!schedule) return null
  let label = ''
  if (schedule === 'asap') label = 'ASAP'
  else if (schedule === 'next-heartbeat') label = 'Next Heartbeat'
  else label = formatTime(schedule)

  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
      <Clock size={10} />
      {label}
    </span>
  )
}

export default function TaskCard({ task, onEdit, onDelete, onRun, isDragging }) {
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id })

  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
  const isInProgress = task.status === 'in-progress'
  const isDone = task.status === 'done'
  const hasError = !!task.error
  const canRun = task.status === 'backlog' || task.status === 'todo'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group bg-card border border-border rounded-lg p-3 border-l-2 cursor-grab active:cursor-grabbing transition-shadow',
        priorityColors[task.priority] || 'border-l-zinc-500',
        isDragging && 'shadow-xl opacity-90 rotate-2',
        isInProgress && 'border-amber-500/50 animate-pulse-subtle',
        hasError && 'border-red-500/50'
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isInProgress && <Loader2 size={12} className="text-amber-400 animate-spin shrink-0" />}
            <p className="text-sm font-medium truncate">{task.title}</p>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {canRun && onRun && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRun(task.id) }}
              onPointerDown={e => e.stopPropagation()}
              className="text-muted-foreground hover:text-green-400 transition-colors"
              title="Execute immediately"
            >
              <Play size={12} />
            </button>
          )}
          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(task) }} onPointerDown={e => e.stopPropagation()} className="text-muted-foreground hover:text-foreground">
              <Pencil size={12} />
            </button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(task.id) }} onPointerDown={e => e.stopPropagation()} className="text-muted-foreground hover:text-destructive">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
          task.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
          task.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
          task.priority === 'medium' ? 'bg-blue-500/20 text-blue-400' :
          'bg-zinc-500/20 text-zinc-400'
        )}>
          {task.priority}
        </span>
        {task.skill && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400">{task.skill}</span>
        )}
        <ScheduleBadge schedule={task.schedule} />
        {hasError && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
            <AlertCircle size={10} /> Error
          </span>
        )}
      </div>

      {/* In Progress: show startedAt */}
      {isInProgress && task.startedAt && (
        <p className="text-[10px] text-muted-foreground mt-1.5">Started {formatTime(task.startedAt)}</p>
      )}

      {/* Done: show completedAt and result */}
      {isDone && (
        <div className="mt-1.5 space-y-1">
          {task.completedAt && <p className="text-[10px] text-muted-foreground">Completed {formatTime(task.completedAt)}</p>}
          {(task.result || task.error) && (
            <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                {task.error ? 'Error Details' : 'Result'}
              </button>
              {expanded && (
                <pre className={cn(
                  'mt-1 text-[10px] font-mono p-2 rounded-md max-h-32 overflow-auto',
                  task.error ? 'bg-red-500/10 text-red-300' : 'bg-secondary text-muted-foreground'
                )}>
                  {task.error || task.result}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
