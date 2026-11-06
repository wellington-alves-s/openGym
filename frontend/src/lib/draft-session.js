// The draft session behind the trainer's editors (spec sections 5 and 8): a student's program and a
// model use the same one. A document is loaded once per key and saved by itself 800 ms after the
// last change, each save with the revision the one before returned. A 409 means it changed
// somewhere else: saving stops until Reload (dropSession), which drops what did not go up.
//
// A program is edited one phase at a time: the session keeps the whole document in `program` and
// one workspace store (lib/workspace.js) showing the open phase. The editor holds that store through
// WorkspaceContext, so another phase replaces its content and never the store itself.
//
// Sessions live here, not in a component: App keys each page on its path, so moving between the
// list and a routine mounts the layout again, and an edge swipe back draws a second copy
// underneath. Both find the same session. It ends once the trainer has left and its last save is
// in; a save that failed keeps it, so coming back saves the edits.
import { createContext, createElement, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from './i18n.js'
import { bundleOf, createWorkspaceStore } from './workspace.js'
import { parsePlan } from './plan-share.js'

const DEBOUNCE_MS = 800

// The session of the page around the editor, for the screens that edit the program itself.
export const DraftSessionContext = createContext(null)

// load(key) → { program, rev }; save(key, program, rev) → { rev }; backTo(key, phaseId) → the path
// the editor goes back to; changedText() → what leaving says after a 409 (the layout's banner too).
export function createDraftSessions({ load, save, backTo, changedText = () => t('The plan changed somewhere else') }) {
  const sessions = new Map()   // key → session, only while the document is open or holds unsaved edits
  const loading = new Map()    // key → the load under way, so two copies of the page fetch once
  const lastRev = new Map()    // key → the newest revision a save returned
  const pages = new Map()      // key → how many copies of the page are mounted
  let account = 0              // bumped on every change of signed-in user: older loads are void
  const watchers = new Set()
  const emit = () => watchers.forEach(fn => fn())
  const watch = fn => { watchers.add(fn); return () => watchers.delete(fn) }

  function createSession(key, doc) {
    const own = useStore.getState().S
    const unit = own.unit === 'lb' ? 'lb' : 'kg'
    const s = { key, program: structuredClone(doc.program), rev: doc.rev, status: '', users: 0, watch,
      timer: null, inFlight: null, dirty: false, failed: false, stopped: false, switching: false }
    const phaseOf = id => s.program.phases.find(ph => ph.id === id)
    // A phase in the trainer's own unit: the editor's sheets show weights in it.
    const viewOf = id => { const b = phaseOf(id).bundle, plan = parsePlan(b, unit); return { ...b, unit, week: plan.week, routines: plan.routines } }
    // Writes the open phase back into the program (a new object, so a save in flight keeps its copy).
    const commit = () => {
      const ph = phaseOf(s.phaseId)
      if (!ph) return
      const bundle = bundleOf(s.store.getState().S, { ...ph.bundle, opengym_plan: 1, customEx: [] })
      s.program = { ...s.program, phases: s.program.phases.map(p => (p === ph ? { ...p, bundle } : p)) }
    }
    // The view first: a phase that cannot be read throws before anything points at it.
    const show = id => {
      const view = viewOf(id)
      s.phaseId = id; s.switching = true
      try { s.store.getState().setPhase(view, backTo(key, id)) } finally { s.switching = false }
    }
    const setStatus = status => { s.status = status; emit() }
    const first = s.program.phases[0].id
    s.phaseId = first
    s.store = createWorkspaceStore(own, viewOf(first), { backTo: backTo(key, first) })

    s.openPhase = id => {
      if (id === s.phaseId || !phaseOf(id)) return
      commit(); show(id); emit()
    }
    // The program with the open phase's latest edits, for a screen that copies a phase out of it.
    s.current = () => { commit(); return s.program }
    s.updateProgram = fn => {
      commit()
      const next = structuredClone(s.program)
      fn(next)
      if (!next.phases?.length) return   // the server refuses a program with no phase, every time
      s.program = next
      if (!phaseOf(s.phaseId)) show(next.phases[0].id)
      if (!s.stopped) { s.dirty = true; s.failed = false; s.schedule() }
      emit()
    }
    s.save = () => {
      clearTimeout(s.timer); s.timer = null
      if (s.stopped || s.inFlight || !s.dirty) return
      s.dirty = false; s.failed = false
      commit()
      setStatus('saving')
      s.inFlight = save(key, s.program, s.rev)
        .then(({ rev }) => { s.rev = rev; if (sessions.get(key) === s) lastRev.set(key, rev); if (!s.dirty) setStatus('saved') })
        .catch(e => {
          if (e?.status === 409) { s.stopped = true; setStatus('conflict') }
          else { s.dirty = true; s.failed = true; setStatus('failed') }
        })
        .finally(() => { s.inFlight = null; if (s.dirty && !s.failed && !s.timer) s.save() })
    }
    s.schedule = () => { clearTimeout(s.timer); s.timer = setTimeout(s.save, DEBOUNCE_MS) }
    s.unsubscribe = s.store.subscribe((next, prev) => {
      if (next.S === prev.S || s.stopped || s.switching) return
      s.dirty = true; s.failed = false
      s.schedule()
    })
    // → true once every edit is on the server, those made while a save was out included.
    s.flush = async () => {
      do { s.save(); while (s.inFlight) await s.inFlight } while (s.dirty && !s.failed && !s.stopped)
      return !s.dirty
    }
    return s
  }

  function dispose(s) {
    s.stopped = true; s.unsubscribe(); clearTimeout(s.timer)
    if (sessions.get(s.key) === s) { sessions.delete(s.key); emit() }
  }
  // Reload: drops the session and what it did not send; the page reads the document again.
  const dropSession = key => { const s = sessions.get(key); if (s) dispose(s) }

  function ensure(key) {
    if (sessions.has(key)) return Promise.resolve(sessions.get(key))
    if (!loading.has(key)) {
      const at = account
      const p = load(key).then(doc => {
        // Nobody is looking any more, or someone else signed in: the next visit reads it afresh.
        if (at !== account || !pages.get(key)) return null
        const s = createSession(key, doc)
        sessions.set(key, s); emit()
        return s
      }).finally(() => { if (loading.get(key) === p) loading.delete(key) })
      loading.set(key, p)
    }
    return loading.get(key)
  }

  // A copy of the page is mounted; → the call for when it goes.
  function page(key) {
    pages.set(key, (pages.get(key) || 0) + 1)
    return () => { const n = pages.get(key) - 1; if (n) pages.set(key, n); else pages.delete(key) }
  }

  function acquire(s) {
    s.users++
    if (s.dirty && !s.timer && !s.inFlight && !s.stopped) s.schedule()   // edits a failed save left behind
    return () => {
      if (--s.users > 0) return
      s.flush().then(ok => {
        if (sessions.get(s.key) !== s || s.users > 0) return
        if (ok) dispose(s)
        else useUI.getState().toast(s.stopped ? changedText() : t('Could not save. Try again.'))
      })
    }
  }

  /* For the screens that publish or restore: saves what is still waiting and resolves with the newest
     revision a save returned (undefined if none here). Rejects while edits cannot be saved, so a
     publish never skips them; a 409 one when the document changed somewhere else. */
  async function whenSaved(key) {
    const s = sessions.get(key)
    if (!s) return lastRev.get(key)
    if (s.stopped) throw Object.assign(new Error('the plan changed elsewhere'), { status: 409 })
    if (!await s.flush()) throw new Error(t('Could not save. Try again.'))
    if (s.users === 0) dispose(s)   // not open: whatever is published next starts fresh
    return s.rev
  }

  // The page around an editor: the session of `key` once loaded, its status, and a failed load.
  function useSession(key) {
    const session = useSyncExternalStore(watch, () => sessions.get(key) || null)
    const status = useSyncExternalStore(watch, () => session?.status || '')
    const [failed, setFailed] = useState(false)
    useEffect(() => page(key), [key])
    const retry = useCallback(() => { setFailed(false); ensure(key).catch(() => setFailed(true)) }, [key])
    useEffect(() => { if (!session) retry() }, [session, retry])
    useEffect(() => (session ? acquire(session) : undefined), [session])
    return { session, status, failed, retry }
  }

  // A tab closed or put away within 800 ms of an edit still saves it.
  if (typeof window !== 'undefined') {
    const saveAll = () => sessions.forEach(s => s.save())
    window.addEventListener('pagehide', saveAll)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveAll() })
  }

  // Signing out reloads nothing: whatever the previous account had open or unsaved here goes with it,
  // so the next one to sign in on this browser never sees it.
  useStore.subscribe((next, prev) => {
    if (next.user?.id === prev.user?.id) return
    account++
    sessions.forEach(dispose)
    lastRev.clear(); loading.clear()
  })

  const sessionOf = key => sessions.get(key) || null
  return { ensure, acquire, page, whenSaved, dropSession, watch, sessionOf, useSession, changedText }
}

// True inside the page an edge swipe back draws underneath the visible one (App's Page `under`).
export const UnderPageContext = createContext(false)

// The element of a route with a `:phase` param: opens that phase on the session above, and shows
// the page once the store holds it (a parent layout cannot read a child route's params). A page
// drawn underneath shares the session with the visible one, so it opens its phase only once it is
// the page; a phase the program does not have (deleted, a stale link) goes back to the program.
export function PhaseGate() {
  const session = useContext(DraftSessionContext)
  const under = useContext(UnderPageContext)
  const { phase } = useParams()
  const shown = useSyncExternalStore(session.watch, () => session.phaseId)
  const known = useSyncExternalStore(session.watch, () => !phase || session.program.phases.some(ph => ph.id === phase))
  useEffect(() => { if (phase && !under) session.openPhase(phase) }, [session, phase, under])
  if (!known) return under ? null : createElement(Navigate, { to: '..', relative: 'path', replace: true })
  return !phase || shown === phase ? createElement(Outlet) : null
}
