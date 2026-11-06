// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PrescriptionWorkspace, { dropSession, whenSaved } from './PrescriptionWorkspace.jsx'
import { DEF, useStore } from '../../store/useStore.js'
import { useWorkspaceStore } from '../../lib/workspace.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The trainer's workspace around a student's draft: loaded once, saved by itself 800 ms after the
   last change with the revision the previous save returned, and stopped by a 409 until Reload. */
const mocks = vi.hoisted(() => ({ getRx: vi.fn(), saveRxDraft: vi.fn() }))
vi.mock('../../lib/trainer-api.js', () => ({
  getRx: (...a) => mocks.getRx(...a), saveRxDraft: (...a) => mocks.saveRxDraft(...a),
}))

const draft = (extra = {}) => ({ opengym_plan: 1, unit: 'kg', week: { 1: ['r1'] }, routines: [{ id: 'r1', name: 'Push', emoji: 'dumbbell', ex: [{ id: '0025', sets: 3, reps: 5, weight: 100 }] }], customEx: [], ...extra })
const rxOf = (rev, bundle = draft()) => ({ rx: { _rev: rev, draft: { bundle, updated: 1 }, current: null, versions: [] } })
const conflict = () => Object.assign(new Error('the plan changed elsewhere'), { status: 409, data: { code: 'conflict', rx: rxOf(9).rx } })

let store, host, root
function Probe() { store = useWorkspaceStore(); return <Outlet /> }
function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter initialEntries={['/students/abc/plan']}>
    <Routes>
      <Route path="/students/:sid/plan" element={<PrescriptionWorkspace />}>
        <Route index element={<Probe />} />
      </Route>
      <Route path="/away" element={<p>away</p>} />
    </Routes>
  </MemoryRouter>))
}
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const rename = name => act(() => store.getState().update(s => { s.routines[0].name = name }))
const wait = ms => act(async () => { vi.advanceTimersByTime(ms) })
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text)

beforeEach(() => {
  vi.useFakeTimers()
  mocks.getRx.mockReset(); mocks.saveRxDraft.mockReset()
  useStore.setState({ S: { ...structuredClone(DEF), unit: 'kg' } })
  store = null
})
afterEach(() => { act(() => root.unmount()); host.remove(); dropSession('abc'); vi.useRealTimers() })

describe('PrescriptionWorkspace', () => {
  it('saves once, 800 ms after the last of two quick edits, then with the revision that save returned', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    mocks.saveRxDraft.mockResolvedValueOnce(rxOf(6)).mockResolvedValueOnce(rxOf(7))
    mount(); await flush()
    expect(store.getState().S.routines[0].name).toBe('Push')
    rename('A'); await wait(500)
    rename('B'); await wait(799)
    expect(mocks.saveRxDraft).not.toHaveBeenCalled()
    await wait(1)
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
    const [sid, bundle, rev] = mocks.saveRxDraft.mock.calls[0]
    expect(sid).toBe('abc'); expect(rev).toBe(5)
    expect(bundle).toMatchObject({ opengym_plan: 1, unit: 'kg', week: { 1: ['r1'] }, customEx: [] })
    expect(bundle.routines[0].name).toBe('B')
    await flush()
    expect(host.textContent).toContain('Saved')
    rename('C'); await wait(800); await flush()
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(2)
    expect(mocks.saveRxDraft.mock.calls[1][2]).toBe(6)
  })

  it('says Saving while the save is out, and saves a change made meanwhile once it returns', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    let release
    mocks.saveRxDraft.mockImplementationOnce(() => new Promise(r => { release = r })).mockResolvedValueOnce(rxOf(7))
    mount(); await flush()
    rename('A'); await wait(800)
    expect(host.textContent).toContain('Saving')
    rename('B'); await wait(800)
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
    await act(async () => { release(rxOf(6)) }); await flush()
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(2)
    expect(mocks.saveRxDraft.mock.calls[1][1].routines[0].name).toBe('B')
    expect(mocks.saveRxDraft.mock.calls[1][2]).toBe(6)
    await flush()
    expect(host.textContent).toContain('Saved')
  })

  it('saves nothing when nothing changed', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    mount(); await flush()
    await wait(5000)
    expect(mocks.saveRxDraft).not.toHaveBeenCalled()
  })

  it('on a 409 says so, saves no more, and Reload reads the plan again', async () => {
    mocks.getRx.mockResolvedValueOnce(rxOf(5)).mockResolvedValueOnce(rxOf(9, draft({ routines: [{ id: 'r1', name: 'Theirs', ex: [] }] })))
    mocks.saveRxDraft.mockRejectedValueOnce(conflict())
    mount(); await flush()
    rename('Mine'); await wait(800); await flush()
    expect(host.querySelector('[role="alert"]').textContent).toContain('The plan changed somewhere else')
    rename('Mine again'); await wait(2000); await flush()
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
    const before = store
    await act(async () => button('Reload').click()); await flush()
    expect(mocks.getRx).toHaveBeenCalledTimes(2)
    expect(store).not.toBe(before)
    expect(store.getState().S.routines[0].name).toBe('Theirs')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    mocks.saveRxDraft.mockResolvedValueOnce(rxOf(10))
    rename('After'); await wait(800)
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(2)
    expect(mocks.saveRxDraft.mock.calls[1][2]).toBe(9)
  })

  it('keeps one store across renders, and edits survive a re-render', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    mocks.saveRxDraft.mockResolvedValue(rxOf(6))
    mount(); await flush()
    const first = store
    rename('Kept'); await wait(800); await flush()
    expect(store).toBe(first)
    expect(store.getState().S.routines[0].name).toBe('Kept')
  })

  it('shows the draft in the trainer\'s own unit and saves it in that unit', async () => {
    useStore.setState({ S: { ...structuredClone(DEF), unit: 'kg' } })
    mocks.getRx.mockResolvedValue(rxOf(5, draft({ unit: 'lb' })))
    mocks.saveRxDraft.mockResolvedValue(rxOf(6))
    mount(); await flush()
    expect(store.getState().S.unit).toBe('kg')
    expect(store.getState().S.routines[0].ex[0].weight).toBeCloseTo(45, 0)
    rename('X'); await wait(800)
    const bundle = mocks.saveRxDraft.mock.calls[0][1]
    expect(bundle.unit).toBe('kg')
    expect(bundle.routines[0].ex[0].weight).toBeCloseTo(45, 0)
  })

  it('a change still waiting when the trainer leaves is saved on the way out', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    mocks.saveRxDraft.mockResolvedValue(rxOf(6))
    mount(); await flush()
    rename('Late'); await wait(100)
    act(() => root.unmount())
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
    expect(mocks.saveRxDraft.mock.calls[0][1].routines[0].name).toBe('Late')
    await act(async () => { await whenSaved('abc') })
    root = createRoot(host)   // afterEach unmounts again
  })
})

describe('PrescriptionWorkspace, one session per student', () => {
  it('a page mounted again finds the same store, with no second read', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    mocks.saveRxDraft.mockResolvedValue(rxOf(6))
    mount(); await flush()
    const first = store
    rename('Kept')
    act(() => root.unmount()); root = createRoot(host)
    store = null
    act(() => root.render(<MemoryRouter initialEntries={['/students/abc/plan']}><Routes>
      <Route path="/students/:sid/plan" element={<PrescriptionWorkspace />}><Route index element={<Probe />} /></Route>
    </Routes></MemoryRouter>))
    expect(store).toBe(first)   // at once, no blank page while it loads
    expect(store.getState().S.routines[0].name).toBe('Kept')
    expect(mocks.getRx).toHaveBeenCalledTimes(1)
  })

  it('a save that fails on the way out keeps the edits, and the next visit saves them with the held revision', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    const offline = () => Object.assign(new Error('offline'), { status: 0 })
    mocks.saveRxDraft.mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline()).mockResolvedValueOnce(rxOf(6))
    mount(); await flush()
    rename('Offline edit')
    act(() => root.unmount()); await flush()
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
    await expect(whenSaved('abc')).rejects.toThrow()
    root = createRoot(host)
    store = null
    act(() => root.render(<MemoryRouter initialEntries={['/students/abc/plan']}><Routes>
      <Route path="/students/:sid/plan" element={<PrescriptionWorkspace />}><Route index element={<Probe />} /></Route>
    </Routes></MemoryRouter>))
    expect(store.getState().S.routines[0].name).toBe('Offline edit')
    await wait(800); await flush()
    expect(mocks.getRx).toHaveBeenCalledTimes(1)
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(3)
    expect(mocks.saveRxDraft.mock.calls[2][1].routines[0].name).toBe('Offline edit')
    expect(mocks.saveRxDraft.mock.calls[2][2]).toBe(5)
    expect(host.textContent).toContain('Saved')
  })

  it('whenSaved sends what is waiting and answers with the newest revision', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    mocks.saveRxDraft.mockResolvedValue(rxOf(6))
    mount(); await flush()
    rename('Now')
    let rev
    await act(async () => { rev = await whenSaved('abc') })
    expect(rev).toBe(6)
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
  })

  it('keeps the status line mounted while idle, and saves at once when the page is hidden', async () => {
    mocks.getRx.mockResolvedValue(rxOf(5))
    mocks.saveRxDraft.mockResolvedValue(rxOf(6))
    mount(); await flush()
    expect(host.querySelector('[role="status"]')).not.toBeNull()
    rename('Closing')
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    delete document.visibilityState
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
  })
})
