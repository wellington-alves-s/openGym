// The trainer's side of a student's draft plan (spec section 5.1): the layout around the plan list and
// the routine editor. It loads the draft into a workspace store (lib/workspace.js) and saves it by
// itself 800 ms after the last change, each save with the revision the one before returned. A 409
// means the plan changed somewhere else: saving stops until Reload, which drops what did not go up.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { getRx, saveRxDraft } from '../../lib/trainer-api.js'
import { WorkspaceContext, bundleOf, createWorkspaceStore } from '../../lib/workspace.js'
import { parsePlan } from '../../lib/plan-share.js'
import { Button } from '../../components/ui.jsx'

const DEBOUNCE_MS = 800

// The save still under way for a student after the workspace closed, so the next screen reads the
// plan (and its revision) only once it is in.
const leaving = new Map()
export const whenSaved = sid => leaving.get(sid) || Promise.resolve()

// The draft in the trainer's own unit: the editor's sheets show weights in it.
function workspaceOf(sid, draft, own) {
  const unit = own.unit === 'lb' ? 'lb' : 'kg'
  const plan = parsePlan(draft, unit)
  const base = { ...draft, opengym_plan: 1, customEx: [] }
  const store = createWorkspaceStore(own, { ...base, unit, week: plan.week, routines: plan.routines }, { backTo: '/students/' + sid + '/plan' })
  return { store, base }
}

function startSaving(sid, { store, base, rev }, setStatus) {
  let timer = null, inFlight = null, dirty = false, failed = false, stopped = false
  const save = () => {
    clearTimeout(timer); timer = null
    if (stopped || inFlight || !dirty) return
    dirty = false; failed = false
    setStatus('saving')
    inFlight = saveRxDraft(sid, bundleOf(store.getState().S, base), rev)
      .then(({ rx }) => { rev = rx._rev; if (!dirty) setStatus('saved') })
      .catch(e => {
        if (e?.status === 409) { stopped = true; setStatus('conflict') }
        else { dirty = true; failed = true; setStatus('failed') }
      })
      .finally(() => { inFlight = null; if (dirty && !failed && !timer) save() })
  }
  const unsubscribe = store.subscribe((s, prev) => {
    if (s.S === prev.S || stopped) return
    dirty = true; failed = false
    clearTimeout(timer); timer = setTimeout(save, DEBOUNCE_MS)
  })
  const flush = async () => { save(); while (inFlight) await inFlight; return !failed }   // → false when it did not go up
  const close = () => { unsubscribe(); return flush() }
  return { save, close }
}

export default function PrescriptionWorkspace() {
  const { sid } = useParams()
  // null while loading, 'failed' when the draft could not be read, else { store, base, rev }: one
  // store per loaded draft, so a render never drops an edit; Reload makes a fresh one on purpose.
  const [ws, setWs] = useState(null)
  const [status, setStatus] = useState('')
  const saver = useRef(null)
  const load = useCallback(async () => {
    setWs(null); setStatus('')
    try {
      await whenSaved(sid)
      const { rx } = await getRx(sid)
      setWs({ ...workspaceOf(sid, rx.draft.bundle, useStore.getState().S), rev: rx._rev })
    } catch { setWs('failed') }
  }, [sid])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!ws || ws === 'failed') return
    const s = saver.current = startSaving(sid, ws, setStatus)
    return () => {
      const done = s.close().then(ok => { if (!ok) useUI.getState().toast(t('Could not save. Try again.')) })
      leaving.set(sid, done)
      done.finally(() => { if (leaving.get(sid) === done) leaving.delete(sid) })
    }
  }, [ws, sid])

  if (ws === null) return null
  if (ws === 'failed') return <div className="narrow"><div className="card" role="alert" style={{ marginTop: 16 }}>
    <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load the plan. Check your connection and try again.')}</div>
    <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
  </div></div>
  return <WorkspaceContext.Provider value={ws.store}>
    {status === 'conflict'
      ? <div className="narrow"><div className="card" role="alert" style={{ marginTop: 8 }}>
        <div className="small" style={{ marginBottom: 10 }}>{t('The plan changed somewhere else')}</div>
        <Button size="sm" icon="reset" onClick={load}>{t('Reload')}</Button>
      </div></div>
      : status && <div className="narrow small dim" role="status" style={{ textAlign: 'end', marginTop: 4 }}>
        {status === 'saving' ? t('Saving') : status === 'saved' ? t('Saved')
          : <>{t('Could not save. Try again.')} <Button size="sm" onClick={() => saver.current?.save()}>{t('Try again')}</Button></>}
      </div>}
    <Outlet />
  </WorkspaceContext.Provider>
}
