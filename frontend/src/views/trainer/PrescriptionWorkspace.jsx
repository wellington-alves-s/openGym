// The trainer's side of a student's draft plan (spec section 5.1): the layout around the plan list and
// the routine editor. It loads the draft into a workspace store (lib/workspace.js) and saves it by
// itself 800 ms after the last change, each save with the revision the one before returned. A 409
// means the plan changed somewhere else: saving stops until Reload, which drops what did not go up.
//
// The store lives in a session per student here, not in the component: App keys each page on its
// path, so moving between the list and a routine mounts this layout again, and an edge swipe back
// draws a second copy underneath. Both find the same session. It ends once the trainer has left
// the plan and its last save is in; a save that failed keeps it, so coming back saves the edits.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { getRx, saveRxDraft } from '../../lib/trainer-api.js'
import { WorkspaceContext, bundleOf, createWorkspaceStore } from '../../lib/workspace.js'
import { parsePlan } from '../../lib/plan-share.js'
import { Button } from '../../components/ui.jsx'

const DEBOUNCE_MS = 800

const sessions = new Map()   // sid → session, only while the plan is open or holds unsaved edits
const loading = new Map()    // sid → the getRx under way, so two copies of the page fetch once
const lastRev = new Map()    // sid → the newest revision a save returned (a number per student)
const pages = new Map()      // sid → how many copies of the page are mounted
let account = 0              // bumped on every change of signed-in user: older loads are void
const watchers = new Set()
const emit = () => watchers.forEach(fn => fn())
const watch = fn => { watchers.add(fn); return () => watchers.delete(fn) }

// The draft in the trainer's own unit: the editor's sheets show weights in it.
function workspaceOf(sid, draft, own) {
  const unit = own.unit === 'lb' ? 'lb' : 'kg'
  const plan = parsePlan(draft, unit)
  const base = { ...draft, opengym_plan: 1, customEx: [] }
  const store = createWorkspaceStore(own, { ...base, unit, week: plan.week, routines: plan.routines }, { backTo: '/students/' + sid + '/plan' })
  return { store, base }
}

function createSession(sid, rx) {
  const s = { sid, ...workspaceOf(sid, rx.draft.bundle, useStore.getState().S), rev: rx._rev, status: '', users: 0,
    timer: null, inFlight: null, dirty: false, failed: false, stopped: false }
  const setStatus = status => { s.status = status; emit() }
  s.save = () => {
    clearTimeout(s.timer); s.timer = null
    if (s.stopped || s.inFlight || !s.dirty) return
    s.dirty = false; s.failed = false
    setStatus('saving')
    s.inFlight = saveRxDraft(sid, bundleOf(s.store.getState().S, s.base), s.rev)
      .then(({ rx }) => { s.rev = rx._rev; if (sessions.get(sid) === s) lastRev.set(sid, rx._rev); if (!s.dirty) setStatus('saved') })
      .catch(e => {
        if (e?.status === 409) { s.stopped = true; setStatus('conflict') }
        else { s.dirty = true; s.failed = true; setStatus('failed') }
      })
      .finally(() => { s.inFlight = null; if (s.dirty && !s.failed && !s.timer) s.save() })
  }
  s.schedule = () => { clearTimeout(s.timer); s.timer = setTimeout(s.save, DEBOUNCE_MS) }
  s.unsubscribe = s.store.subscribe((next, prev) => {
    if (next.S === prev.S || s.stopped) return
    s.dirty = true; s.failed = false
    s.schedule()
  })
  // → true once every edit is on the server.
  s.flush = async () => { s.save(); while (s.inFlight) await s.inFlight; return !s.dirty }
  return s
}

function dispose(s) {
  s.stopped = true; s.unsubscribe(); clearTimeout(s.timer)
  if (sessions.get(s.sid) === s) { sessions.delete(s.sid); emit() }
}
// Reload: drops the session and what it did not send; the page reads the plan again.
export const dropSession = sid => { const s = sessions.get(sid); if (s) dispose(s) }

function ensureSession(sid) {
  if (sessions.has(sid)) return Promise.resolve(sessions.get(sid))
  if (!loading.has(sid)) {
    const at = account
    const p = getRx(sid).then(({ rx }) => {
      // Nobody is looking any more, or someone else signed in: the next visit reads it afresh.
      if (at !== account || !pages.get(sid)) return null
      const s = createSession(sid, rx)
      sessions.set(sid, s); emit()
      return s
    }).finally(() => { if (loading.get(sid) === p) loading.delete(sid) })
    loading.set(sid, p)
  }
  return loading.get(sid)
}

function acquire(s) {
  s.users++
  if (s.dirty && !s.timer && !s.inFlight && !s.stopped) s.schedule()   // edits a failed save left behind
  return () => {
    if (--s.users > 0) return
    s.flush().then(ok => {
      if (sessions.get(s.sid) !== s || s.users > 0) return
      if (ok) dispose(s)
      else useUI.getState().toast(s.stopped ? t('The plan changed somewhere else') : t('Could not save. Try again.'))
    })
  }
}

/* For the screens that publish or restore: saves what is still waiting and resolves with the newest
   revision a save returned (undefined if none here). Rejects while edits cannot be saved, so a
   publish never skips them; a 409 one when the plan changed somewhere else. */
export async function whenSaved(sid) {
  const s = sessions.get(sid)
  if (!s) return lastRev.get(sid)
  if (s.stopped) throw Object.assign(new Error('the plan changed elsewhere'), { status: 409 })
  if (!await s.flush()) throw new Error(t('Could not save. Try again.'))
  if (s.users === 0) dispose(s)   // the plan is not open: whatever is published next starts fresh
  return s.rev
}

// A tab closed or put away within 800 ms of an edit still saves it.
if (typeof window !== 'undefined') {
  const saveAll = () => sessions.forEach(s => s.save())
  window.addEventListener('pagehide', saveAll)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveAll() })
}

// Signing out reloads nothing: whatever the previous account had open or unsaved here goes with it,
// so the next one to sign in on this browser never sees that student's draft.
useStore.subscribe((next, prev) => {
  if (next.user?.id === prev.user?.id) return
  account++
  sessions.forEach(dispose)
  lastRev.clear(); loading.clear()
})

export default function PrescriptionWorkspace() {
  const { sid } = useParams()
  const session = useSyncExternalStore(watch, () => sessions.get(sid) || null)
  const status = useSyncExternalStore(watch, () => session?.status || '')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    pages.set(sid, (pages.get(sid) || 0) + 1)
    return () => { const n = pages.get(sid) - 1; if (n) pages.set(sid, n); else pages.delete(sid) }
  }, [sid])
  const load = useCallback(() => { setFailed(false); ensureSession(sid).catch(() => setFailed(true)) }, [sid])
  useEffect(() => { if (!session) load() }, [session, load])
  useEffect(() => (session ? acquire(session) : undefined), [session])

  if (!session) return failed ? <div className="narrow"><div className="card" role="alert" style={{ marginTop: 16 }}>
    <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load the plan. Check your connection and try again.')}</div>
    <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
  </div></div> : null
  return <WorkspaceContext.Provider value={session.store}>
    {status === 'conflict' && <div className="narrow"><div className="card" role="alert" style={{ marginTop: 8 }}>
      <div className="small" style={{ marginBottom: 10 }}>{t('The plan changed somewhere else')}</div>
      <Button size="sm" icon="reset" onClick={() => dropSession(sid)}>{t('Reload')}</Button>
    </div></div>}
    {/* Always there, empty when idle, so a screen reader hears each change. */}
    <div className="narrow small dim" role="status" style={{ textAlign: 'end', marginTop: 4 }}>
      {status === 'saving' ? t('Saving') : status === 'saved' ? t('Saved')
        : status === 'failed' ? <>{t('Could not save. Try again.')} <Button size="sm" onClick={() => session.save()}>{t('Try again')}</Button></> : null}
    </div>
    <Outlet />
  </WorkspaceContext.Provider>
}
