import React, { useState, useEffect } from 'react'
import { X, Clock } from 'lucide-react'

function getDefaultScheduleTime() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  // Format for datetime-local input
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TaskDialog({ open, onClose, onSave, task }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', skill: '', status: 'backlog', schedule: null })
  const [scheduleType, setScheduleType] = useState('none')
  const [scheduleTime, setScheduleTime] = useState(getDefaultScheduleTime())
  const [skills, setSkills] = useState([])

  useEffect(() => {
    fetch('/api/skills').then(r => r.json()).then(setSkills).catch(() => {})
  }, [])

  useEffect(() => {
    if (task) {
      setForm({ title: task.title, description: task.description, priority: task.priority, skill: task.skill || '', status: task.status, schedule: task.schedule || null })
      if (!task.schedule) { setScheduleType('none') }
      else if (task.schedule === 'asap') { setScheduleType('asap') }
      else if (task.schedule === 'next-heartbeat') { setScheduleType('next-heartbeat') }
      else { setScheduleType('specific'); setScheduleTime(task.schedule.slice(0, 16)) }
    } else {
      setForm({ title: '', description: '', priority: 'medium', skill: '', status: 'backlog', schedule: null })
      setScheduleType('none')
      setScheduleTime(getDefaultScheduleTime())
    }
  }, [task, open])

  if (!open) return null

  function handleSave() {
    if (!form.title) return
    let schedule = null
    if (scheduleType === 'asap') schedule = 'asap'
    else if (scheduleType === 'next-heartbeat') schedule = 'next-heartbeat'
    else if (scheduleType === 'specific') schedule = new Date(scheduleTime).toISOString()
    const data = { ...form, schedule }
    if (schedule) data.scheduledAt = new Date().toISOString()
    onSave(data)
  }

  const scheduleOptions = [
    { value: 'none', label: 'No Schedule' },
    { value: 'asap', label: 'ASAP' },
    { value: 'next-heartbeat', label: 'Next Heartbeat' },
    { value: 'specific', label: 'Specific Time' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Title</label>
            <input
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Task title..."
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description</label>
            <textarea
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary resize-none h-20"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
              <select
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <select
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none"
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="backlog">Backlog</option>
                <option value="todo">Todo</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Skill</label>
            <select
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none"
              value={form.skill}
              onChange={e => setForm(f => ({ ...f, skill: e.target.value }))}
            >
              <option value="">None</option>
              {skills.map(s => {
                const id = typeof s === 'string' ? s : s.id || s.name
                const label = typeof s === 'string' ? s : s.name || s.id
                return <option key={id} value={id}>{label}</option>
              })}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
              <Clock size={12} className="text-orange-500" /> Schedule
            </label>
            <div className="flex flex-wrap gap-1.5">
              {scheduleOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScheduleType(opt.value)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    scheduleType === opt.value
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {scheduleType === 'specific' && (
              <input
                type="datetime-local"
                className="mt-2 w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-orange-500"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md bg-secondary hover:bg-accent transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
          >
            {task ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
