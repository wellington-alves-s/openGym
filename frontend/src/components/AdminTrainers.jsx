// Admin card for trainer accounts (only on an instance with trainer mode on): the pending ones to
// approve or reject, the approved ones with their student count, and, for the owner, the switch
// that makes the owner's own account a trainer. An admin who is not the owner reads the lists only.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate, isoOf } from '../lib/format.js'
import { listTrainers, approveTrainer, rejectTrainer, setTrainerMode } from '../lib/trainer-api.js'
import { confirmSheet } from '../sheets.jsx'
import { Button, Switch } from './ui.jsx'

const say = e => useUI.getState().toast(e?.data?.error || e?.message || 'Could not save. Try again.')
const sep = i => ({ padding: '8px 2px', borderTop: i ? 'var(--hair) solid var(--sep)' : 'none' })

export default function AdminTrainers({ owner, ownId }) {
  // null while loading, 'failed' when the list could not be read, else the trainers.
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(false)
  // What the server answered to the owner's last switch change, until a fresh list says it itself.
  const [ownOn, setOwnOn] = useState(null)
  const inFlight = useRef(false)
  const load = useCallback(async () => {
    try { const l = await listTrainers(); setList(l); setOwnOn(null) } catch { setList(prev => (Array.isArray(prev) ? prev : 'failed')) }
  }, [])
  useEffect(() => { load() }, [load])

  // One action at a time (a second tap would repeat it); each ends with a fresh list, whatever the
  // answer was: the server knows best.
  const run = async (fn, refreshMe) => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true)
    try {
      await fn()
      if (refreshMe) {
        // The same /api/me the app boots with, so the owner's tabs follow the new role.
        try {
          const me = await api('/api/me')
          if (me?.user?.id) useStore.getState().setUser(me.user)
        } catch { /* the next sign-in reads it; the change itself is done */ }
      }
    } catch (e) { say(e) }
    await load()
    inFlight.current = false; setBusy(false)
  }
  // The controls are aria-disabled, not disabled, while busy (a disabled one drops keyboard focus),
  // so every tap comes here: one that only opens a confirm is ignored too.
  const reject = p => {
    if (inFlight.current) return
    confirmSheet({
      title: 'Reject ' + p.name + '?', message: 'The account is deleted.',
      confirmText: 'Reject', danger: true, onConfirm: () => run(() => rejectTrainer(p.id)),
    })
  }
  const rows = Array.isArray(list) ? list : []
  const pending = rows.filter(p => p.status === 'pending')
  const approved = rows.filter(p => p.status === 'approved')
  const isTrainer = ownOn ?? approved.some(p => p.id === ownId)
  const flip = on => {
    const go = () => run(async () => { await setTrainerMode(ownId, on); setOwnOn(on) }, true)
    if (on) return go()
    if (inFlight.current) return
    confirmSheet({
      title: 'Turn off trainer mode?', message: 'Your students are unlinked. They keep their own accounts and data.',
      confirmText: 'Turn off', danger: true, onConfirm: go,
    })
  }

  return <div className="card">
    <h2 style={{ margin: 0 }}>Personal trainers</h2>
    {list === null ? null
      : list === 'failed' ? <div role="alert">
        <div className="adm-lead">Could not load trainers.</div>
        <Button size="sm" icon="reset" onClick={load}>Try again</Button>
      </div>
      : <>
        {owner && <div className="row between" style={{ margin: '10px 0 4px' }}>
          <span>Trainer mode on my account</span>
          <Switch aria-label="Trainer mode on my account" checked={isTrainer} aria-disabled={busy} onChange={flip} />
        </div>}
        {!rows.length && <div className="adm-empty">No trainer accounts yet.</div>}
        {pending.length > 0 && <>
          <div className="adm-group-t">Waiting for approval</div>
          {pending.map((p, i) => <div key={p.id} style={sep(i)}>
            <div className="row between">
              <strong>{p.name}</strong>
              <span className="small dim">{fmtDate(isoOf(new Date(p.created)), false, true)}</span>
            </div>
            {owner && <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <Button size="sm" variant="primary" aria-label={'Approve ' + p.name} aria-disabled={busy} onClick={() => run(() => approveTrainer(p.id))}>Approve</Button>
              <Button size="sm" aria-label={'Reject ' + p.name} aria-disabled={busy} onClick={() => reject(p)}>Reject</Button>
            </div>}
          </div>)}
        </>}
        {approved.length > 0 && <>
          <div className="adm-group-t" style={{ marginTop: pending.length ? 12 : 0 }}>Approved</div>
          {approved.map((p, i) => <div key={p.id} className="row between" style={sep(i)}>
            <strong>{p.name}</strong>
            <span className="small dim">{(p.students === 1 ? '1 student' : (p.students || 0) + ' students')}</span>
          </div>)}
        </>}
      </>}
  </div>
}
