import React, { useState, useEffect } from 'react'
import { Lock, Plus, Pencil, Trash2, X, KeyRound, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

const API = '/api/credentials'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-t-xl sm:rounded-lg w-full max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Lock size={16} className="text-orange-400" />{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function CredentialsManager() {
  const [creds, setCreds] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | {mode:'add'} | {mode:'edit', name}
  const [deleting, setDeleting] = useState(null)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => {
    fetch(API).then(r => r.json()).then(setCreds).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openAdd = () => { setName(''); setValue(''); setModal({ mode: 'add' }) }
  const openEdit = (n) => { setName(n); setValue(''); setModal({ mode: 'edit', name: n }) }
  const close = () => { setModal(null); setName(''); setValue('') }

  const save = async () => {
    const slug = modal.mode === 'add' ? name.trim() : modal.name
    if (!slug || !value) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/${encodeURIComponent(slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (res.ok) { close(); load() }
    } finally { setSaving(false) }
  }

  const confirmDelete = async (n) => {
    setDeleting(n)
  }
  const doDelete = async (n) => {
    await fetch(`${API}/${encodeURIComponent(n)}`, { method: 'DELETE' })
    setDeleting(null)
    load()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-orange-400" />
          <h1 className="text-lg font-semibold">Credentials</h1>
          <span className="text-xs text-muted-foreground">~/.openclaw/credentials/</span>
        </div>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-sm font-medium transition-colors">
          <Plus size={14} /> Add Credential
        </button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Loading…</div>
      ) : creds.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <KeyRound size={32} className="mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">No credentials stored yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {creds.map(c => (
            <div key={c.name} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3 group">
              <div className="flex items-center gap-3 min-w-0">
                <Lock size={14} className="text-orange-400 shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-mono font-medium block truncate">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(c.modifiedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(c.name)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="Update value">
                  <Pencil size={14} />
                </button>
                {deleting === c.name ? (
                  <button onClick={() => doDelete(c.name)} className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30">Confirm</button>
                ) : (
                  <button onClick={() => confirmDelete(c.name)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-red-400" title="Delete">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={modal.mode === 'add' ? 'Add Credential' : 'Update Credential'} onClose={close}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              {modal.mode === 'add' ? (
                <input value={name} onChange={e => setName(e.target.value)} placeholder="my-api-key"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-500" />
              ) : (
                <div className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-muted-foreground">{modal.name}</div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Value</label>
              <input type="password" value={value} onChange={e => setValue(e.target.value)} placeholder="••••••••"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-orange-500" />
            </div>
            <button onClick={save} disabled={saving || !value || (modal.mode === 'add' && !name.trim())}
              className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
