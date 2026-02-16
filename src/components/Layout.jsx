import React from 'react'
import { cn } from '@/lib/utils'
import UsageWidget from './Usage/UsageWidget'
// HeartbeatTimer moved to Todo column
import { LayoutDashboard, Calendar, FolderOpen, Puzzle, Heart } from 'lucide-react'

const navItems = [
  { id: 'kanban', label: 'Tasks', icon: LayoutDashboard },
  { id: 'calendar', label: 'Activity', icon: Calendar },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'soul', label: 'Soul', icon: Heart },
]

export default function Layout({ page, setPage, children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            ⚡ VidClaw
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Clawmand Center</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                page === item.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-border text-xs text-muted-foreground">
          localhost:3333
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
          <span className="text-sm font-medium capitalize">{page === 'kanban' ? 'Task Board' : page === 'calendar' ? 'Activity Calendar' : page === 'skills' ? 'Skills Manager' : page === 'soul' ? 'Soul Editor' : 'Content Browser'}</span>
          <UsageWidget />
        </header>
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
    </div>
  )
}
