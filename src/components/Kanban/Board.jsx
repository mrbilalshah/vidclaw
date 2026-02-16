import React, { useState, useEffect, useCallback, useRef } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import Column from './Column'
import TaskCard from './TaskCard'
import TaskDialog from './TaskDialog'

const COLUMNS = [
  { id: 'backlog', title: 'Backlog', color: 'bg-zinc-500' },
  { id: 'todo', title: 'Todo', color: 'bg-blue-500' },
  { id: 'in-progress', title: 'In Progress', color: 'bg-amber-500' },
  { id: 'done', title: 'Done', color: 'bg-green-500' },
]

export default function Board() {
  const [tasks, setTasks] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTask, setEditTask] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const fetchTasks = useCallback(async () => {
    const res = await fetch('/api/tasks')
    setTasks(await res.json())
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchTasks, 30000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  const activeTask = tasks.find(t => t.id === activeId)

  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const columnId = over.id
    if (!COLUMNS.find(c => c.id === columnId)) return
    const task = tasks.find(t => t.id === active.id)
    if (!task || task.status === columnId) return
    // Only allow dragging to backlog or todo
    if (columnId === 'in-progress' || columnId === 'done') return
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: columnId }),
    })
    fetchTasks()
  }

  async function handleSave(data) {
    if (editTask) {
      await fetch(`/api/tasks/${editTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    setDialogOpen(false)
    setEditTask(null)
    fetchTasks()
  }

  async function handleDelete(id) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    fetchTasks()
  }

  async function handleRun(id) {
    await fetch(`/api/tasks/${id}/run`, { method: 'POST' })
    fetchTasks()
  }

  async function handleQuickAdd(status, title) {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, status, priority: 'medium' }),
    })
    fetchTasks()
  }

  function openNew(status) {
    setEditTask(null)
    setDialogOpen(true)
  }

  function openEdit(task) {
    setEditTask(task)
    setDialogOpen(true)
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={e => setActiveId(e.active.id)} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 h-full overflow-x-auto pb-2">
          {COLUMNS.map(col => (
            <Column
              key={col.id}
              column={col}
              tasks={tasks.filter(t => t.status === col.id)}
              onAdd={() => openNew(col.id)}
              onQuickAdd={handleQuickAdd}
              onEdit={openEdit}
              onDelete={handleDelete}
              onRun={handleRun}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
        </DragOverlay>
      </DndContext>
      <TaskDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditTask(null) }}
        onSave={handleSave}
        task={editTask}
      />
    </>
  )
}
