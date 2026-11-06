// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModelWorkspace, { dropSession } from './ModelWorkspace.jsx'
import PrescriptionWorkspace, { dropSession as dropStudent } from './PrescriptionWorkspace.jsx'
import PrescriptionPlan from './PrescriptionPlan.jsx'
import { DEF, useStore } from '../../store/useStore.js'
import { useWorkspaceStore } from '../../lib/workspace.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A model is edited like a month of a program: one fixed phase, loaded once, saved by itself 800 ms
   after the last change with the model's _rev, stopped by a 409 until Reload. Its sessions are its
   own: a student's draft with the same key is another document. */
const mocks = vi.hoisted(() => ({ getModel: vi.fn(), saveModel: vi.fn(), getRx: vi.fn(), saveRxDraft: vi.fn() }))
vi.mock('../../lib/trainer-api.js', () => ({
  getModel: (...a) => mocks.getModel(...a), saveModel: (...a) => mocks.saveModel(...a),
  getRx: (...a) => mocks.getRx(...a), saveRxDraft: (...a) => mocks.saveRxDraft(...a),
}))
vi.mock('../../sheets.jsx', () => ({ confirmSheet: vi.fn() }))

const bundle = (name = 'Push') => ({ opengym_plan: 1, unit: 'kg', week: { 1: ['r1'] }, routines: [{ id: 'r1', name, emoji: 'dumbbell', ex: [{ id: '0025', sets: 3, reps: 5, weight: 100 }] }], customEx: [] })
const modelOf = (rev, b = bundle()) => ({ model: { id: 'm1', name: 'Base', updated: 1, _rev: rev, bundle: b } })
const rxOf = rev => ({ rx: { _rev: rev, draft: { program: { start: null, phases: [{ id: 'p1', name: '', weeks: 4, bundle: bundle('Student day') }] }, updated: 1 }, current: null, versions: [] } })

let store, host, root
// The editor stand-in: holds the store, and goes back the way RoutineEdit does.
function Editor() {
  store = useWorkspaceStore()
  const nav = useNavigate()
  const back = store.getState().backTo
  return <button data-back={back} onClick={() => nav(back)}>editor</button>
}
function mount(path = '/models/m1/plan') {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/models" element={<p>models list</p>} />
      <Route path="/models/:mid/plan" element={<ModelWorkspace />}>
        <Route index element={<PrescriptionPlan />} />
        <Route path=":id" element={<Editor />} />
      </Route>
    </Routes>
  </MemoryRouter>))
}
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const rename = name => act(() => store.getState().update(s => { s.routines[0].name = name }))
const wait = ms => act(async () => { vi.advanceTimersByTime(ms) })
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text)

beforeEach(() => {
  vi.useFakeTimers()
  for (const m of Object.values(mocks)) m.mockReset()
  useStore.setState({ S: { ...structuredClone(DEF), unit: 'kg' } })
  store = null
})
afterEach(() => { act(() => root.unmount()); host.remove(); dropSession('m1'); dropStudent('m1'); vi.useRealTimers() })

describe('ModelWorkspace', () => {
  it('shows the model as one list of routines, and saves an edit by itself 800 ms later with the model rev', async () => {
    mocks.getModel.mockResolvedValue(modelOf(4))
    mocks.saveModel.mockResolvedValueOnce(modelOf(5)).mockResolvedValueOnce(modelOf(6))
    mount('/models/m1/plan/r1'); await flush()
    expect(mocks.getModel).toHaveBeenCalledWith('m1')
    expect(store.getState().backTo).toBe('/models/m1/plan')
    rename('Edited'); await wait(799)
    expect(mocks.saveModel).not.toHaveBeenCalled()
    await wait(1)
    expect(mocks.saveModel).toHaveBeenCalledTimes(1)
    const [mid, body] = mocks.saveModel.mock.calls[0]
    expect(mid).toBe('m1')
    expect(Object.keys(body).sort()).toEqual(['_rev', 'bundle'])
    expect(body._rev).toBe(4)
    expect(body.bundle).toMatchObject({ opengym_plan: 1, unit: 'kg', week: { 1: ['r1'] }, customEx: [] })
    expect(body.bundle.routines[0].name).toBe('Edited')
    await flush()
    expect(host.textContent).toContain('Saved')
    rename('Again'); await wait(800); await flush()
    expect(mocks.saveModel.mock.calls[1][1]._rev).toBe(5)
  })

  it('on a 409 says the model changed, saves no more, and Reload reads it again', async () => {
    mocks.getModel.mockResolvedValueOnce(modelOf(4)).mockResolvedValueOnce(modelOf(9, bundle('Theirs')))
    mocks.saveModel.mockRejectedValueOnce(Object.assign(new Error('the model changed elsewhere'), { status: 409, data: { code: 'conflict', model: modelOf(9).model } }))
    mount('/models/m1/plan/r1'); await flush()
    rename('Mine'); await wait(800); await flush()
    expect(host.querySelector('[role="alert"]').textContent).toContain('The model changed somewhere else')
    rename('Mine again'); await wait(2000); await flush()
    expect(mocks.saveModel).toHaveBeenCalledTimes(1)
    await act(async () => button('Reload').click()); await flush()
    expect(mocks.getModel).toHaveBeenCalledTimes(2)
    expect(store.getState().S.routines[0].name).toBe('Theirs')
    expect(host.querySelector('[role="alert"]')).toBeNull()
    mocks.saveModel.mockResolvedValueOnce(modelOf(10))
    rename('After'); await wait(800)
    expect(mocks.saveModel.mock.calls[1][1]._rev).toBe(9)
  })

  it('keeps the edits from the routine back to the model list, without reading it again; the list goes back to the models', async () => {
    mocks.getModel.mockResolvedValue(modelOf(4))
    mocks.saveModel.mockImplementation(async (mid, { _rev }) => modelOf(_rev + 1))
    mount(); await flush()
    expect(host.querySelector('h2').textContent).toBe('Base')
    await act(async () => host.querySelector('li [role="button"]').click())
    expect(host.textContent).toContain('editor')
    rename('Edited day')
    await act(async () => host.querySelector('button[data-back="/models/m1/plan"]').click())
    expect(host.querySelector('li .tt').textContent).toBe('Edited day')
    expect(mocks.getModel).toHaveBeenCalledTimes(1)
    await act(async () => host.querySelector('button[data-back="/models"]').click()); await flush()
    expect(host.textContent).toContain('models list')
    expect(mocks.saveModel).toHaveBeenCalledTimes(1)
    expect(mocks.saveModel.mock.calls[0][1].bundle.routines[0].name).toBe('Edited day')
  })

  it('a model that does not load says so, and Try again reads it again', async () => {
    mocks.getModel.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 })).mockResolvedValue(modelOf(4))
    mount(); await flush()
    expect(host.querySelector('[role="alert"]').textContent).toContain('Could not load the model')
    await act(async () => button('Try again').click()); await flush()
    expect(host.querySelector('h2').textContent).toBe('Base')
  })

  it('never touches a student session with the same key, and the other way round', async () => {
    mocks.getModel.mockResolvedValue(modelOf(4))
    mocks.getRx.mockResolvedValue(rxOf(7))
    mocks.saveModel.mockResolvedValue(modelOf(5))
    mocks.saveRxDraft.mockResolvedValue(rxOf(8))
    let studentStore
    function StudentProbe() { studentStore = useWorkspaceStore(); return null }
    const other = document.createElement('div'); document.body.appendChild(other)
    const otherRoot = createRoot(other)
    act(() => otherRoot.render(<MemoryRouter initialEntries={['/students/m1/plan']}><Routes>
      <Route path="/students/:sid/plan" element={<PrescriptionWorkspace />}><Route index element={<StudentProbe />} /></Route>
    </Routes></MemoryRouter>))
    mount('/models/m1/plan/r1'); await flush()
    expect(store).not.toBe(studentStore)
    expect(studentStore.getState().S.routines[0].name).toBe('Student day')
    rename('Model edit'); await wait(800); await flush()
    expect(mocks.saveModel).toHaveBeenCalledTimes(1)
    expect(mocks.saveRxDraft).not.toHaveBeenCalled()
    expect(studentStore.getState().S.routines[0].name).toBe('Student day')
    act(() => studentStore.getState().update(s => { s.routines[0].name = 'Student edit' })); await wait(800); await flush()
    expect(mocks.saveRxDraft).toHaveBeenCalledTimes(1)
    expect(mocks.saveModel).toHaveBeenCalledTimes(1)
    expect(store.getState().S.routines[0].name).toBe('Model edit')
    dropStudent('m1'); await flush()
    expect(mocks.getModel).toHaveBeenCalledTimes(1)
    expect(store.getState().S.routines[0].name).toBe('Model edit')
    act(() => otherRoot.unmount()); other.remove()
  })
})
