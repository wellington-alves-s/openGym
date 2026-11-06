// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProgramView from './ProgramView.jsx'
import { DEF, useStore } from '../../store/useStore.js'
import { WorkspaceContext } from '../../lib/workspace.js'
import { DraftSessionContext, createDraftSessions } from '../../lib/draft-session.js'
import { fmtDateRange } from '../../lib/format.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A student's program: the start date and the months, each with its dates, length and routines;
   months are added, copied, taken from a model, moved, renamed and deleted, all on the session. */
const mocks = vi.hoisted(() => ({ confirmSheet: vi.fn(), openSheet: vi.fn(), toast: vi.fn() }))
vi.mock('../../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirmSheet(...a) }))
vi.mock('../../lib/trainer-api.js', () => ({ listModels: vi.fn(), getModel: vi.fn(), createModel: vi.fn() }))
vi.mock('../../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: (...a) => mocks.openSheet(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})

const bundle = (name, id = 'r1') => ({ opengym_plan: 1, unit: 'kg', week: { 1: [id] }, routines: [{ id, name, ex: [{ id: '0025', sets: 3, reps: 5, weight: 100 }] }], customEx: [] })
const twoMonths = () => ({ start: '2026-03-02', phases: [
  { id: 'p1', name: 'Base', weeks: 4, bundle: bundle('Push') },
  { id: 'p2', name: '', weeks: 2, bundle: { ...bundle('Pull', 'r2'), routines: [...bundle('Pull', 'r2').routines, { id: 'r3', name: 'Legs', ex: [] }] } },
] })
const legacy = () => ({ start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: bundle('Push') }] })

let reg, session, save, host, root, release
async function mount(program = twoMonths()) {
  save = vi.fn(async (key, p, rev) => ({ rev: rev + 1 }))
  reg = createDraftSessions({ load: async () => ({ program: structuredClone(program), rev: 1 }), save: (...a) => save(...a), backTo: (sid, id) => `/students/${sid}/plan/${id}` })
  const leave = reg.page('abc')
  session = await reg.ensure('abc')
  release = [leave, reg.acquire(session)]
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<DraftSessionContext.Provider value={session}><WorkspaceContext.Provider value={session.store}>
    <MemoryRouter initialEntries={['/students/abc/plan']}>
      <Routes>
        <Route path="/students/:sid/plan" element={<ProgramView />} />
        <Route path="/students/:sid/plan/:phase" element={<p>month page</p>} />
        <Route path="/students/:sid" element={<p>student</p>} />
      </Routes>
    </MemoryRouter>
  </WorkspaceContext.Provider></DraftSessionContext.Provider>))
}
const phases = () => session.program.phases
const months = () => [...host.querySelectorAll('ul.months > li')]
const titles = () => months().map(li => li.querySelector('.tt').textContent)
const press = (el, text) => act(() => [...el.querySelectorAll('button')].find(b => b.textContent === text || b.getAttribute('aria-label') === text).click())
const buttonIn = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent === text || b.getAttribute('aria-label') === text)
function type(el, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

beforeEach(() => {
  for (const k of Object.keys(mocks)) mocks[k].mockReset()
  useStore.setState({ S: { ...structuredClone(DEF), unit: 'kg' }, user: null })
})
afterEach(() => { act(() => root.unmount()); host.remove(); release.forEach(f => f()); reg.dropSession('abc') })

describe('ProgramView', () => {
  it('lists the months with their dates from the start, their length and their routines', async () => {
    await mount()
    expect(host.querySelector('ul.months').tagName).toBe('UL')
    expect(titles()).toEqual(['Base', 'Month 2'])
    expect(months()[0].textContent).toContain(fmtDateRange('2026-03-02', '2026-03-29'))
    expect(months()[1].textContent).toContain(fmtDateRange('2026-03-30', '2026-04-12'))
    expect(months()[0].textContent).toContain('1 routine')
    expect(months()[1].textContent).toContain('2 routines')
    expect(months()[1].querySelector('input[aria-label="Weeks"]').value).toBe('2')
    expect(host.textContent).not.toContain('Pick a start date')
  })

  it('a new start date moves every month', async () => {
    await mount()
    type(host.querySelector('input[type="date"]'), '2026-04-06')
    expect(session.program.start).toBe('2026-04-06')
    expect(months()[0].textContent).toContain(fmtDateRange('2026-04-06', '2026-05-03'))
    expect(months()[1].textContent).toContain(fmtDateRange('2026-05-04', '2026-05-17'))
    type(host.querySelector('input[type="date"]'), '')
    expect(session.program.start).toBeNull()
    expect(host.textContent).toContain('Pick a start date')
  })

  it('a tap on a month opens its routines', async () => {
    await mount()
    act(() => months()[1].querySelector('[role="button"]').click())
    expect(host.textContent).toContain('month page')
  })

  it('New month adds an empty month of four weeks in the trainer\'s unit', async () => {
    useStore.setState({ S: { ...structuredClone(DEF), unit: 'lb' } })
    await mount()
    press(host, 'New month')
    expect(phases()).toHaveLength(3)
    const made = phases()[2]
    expect(made).toMatchObject({ name: '', weeks: 4, bundle: { opengym_plan: 1, unit: 'lb', week: {}, routines: [], customEx: [] } })
    expect(made.id).toMatch(/^[\w-]{1,64}$/)
    expect(phases().map(p => p.id)).not.toContain(undefined)
    expect(new Set(phases().map(p => p.id)).size).toBe(3)
    expect(titles()[2]).toBe('Month 3')
  })

  it('Duplicate previous month copies the last month with the same routine ids under a new month id', async () => {
    await mount()
    press(host, 'Duplicate previous month')
    const [, last, copy] = phases()
    expect(copy.id).not.toBe(last.id)
    expect(copy.id).toMatch(/^[\w-]{1,64}$/)
    expect(copy).toMatchObject({ name: '', weeks: 2 })
    expect(copy.bundle.routines.map(r => r.id)).toEqual(['r2', 'r3'])
    expect(copy.bundle.week).toEqual(last.bundle.week)
  })

  it('Duplicate previous month takes the open month\'s latest edits', async () => {
    await mount()
    session.openPhase('p2')
    act(() => session.store.getState().update(S => { S.routines[0].name = 'Pull edited' }))
    press(host, 'Duplicate previous month')
    expect(phases()[2].bundle.routines[0].name).toBe('Pull edited')
    expect(months()[1].textContent).toContain('2 routines')
  })

  it('moves a month up and down, and not past either end', async () => {
    await mount()
    expect(buttonIn(months()[0], 'Move up').disabled).toBe(true)
    expect(buttonIn(months()[1], 'Move down').disabled).toBe(true)
    press(months()[0], 'Move down')
    expect(phases().map(p => p.id)).toEqual(['p2', 'p1'])
    press(months()[1], 'Move up')
    expect(phases().map(p => p.id)).toEqual(['p1', 'p2'])
  })

  it('deletes a month only once confirmed, and never the last one', async () => {
    await mount()
    press(months()[1], 'Delete Month 2')
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(mocks.confirmSheet.mock.calls[0][0]).toMatchObject({ title: 'Delete Month 2?', confirmText: 'Delete month', danger: true })
    expect(phases()).toHaveLength(2)
    act(() => mocks.confirmSheet.mock.calls[0][0].onConfirm())
    expect(phases().map(p => p.id)).toEqual(['p1'])
    expect(buttonIn(months()[0], 'Delete Base')).toBeUndefined()
  })

  it('renames a month', async () => {
    await mount()
    type(months()[1].querySelector('input[aria-label="Month name"]'), 'Peak')
    expect(phases()[1].name).toBe('Peak')
    expect(titles()[1]).toBe('Peak')
  })

  it('takes a whole number of weeks from 1 to 52 and refuses the rest', async () => {
    await mount()
    const weeks = () => months()[0].querySelector('input[aria-label="Weeks"]')
    for (const bad of ['0', '53', '2.5', '']) {
      type(weeks(), bad)
      expect(phases()[0].weeks).toBe(4)
      expect(months()[0].querySelector('[role="alert"]').textContent).toBe('Weeks go from 1 to 52')
    }
    type(weeks(), '6')
    expect(phases()[0].weeks).toBe(6)
    expect(months()[0].querySelector('[role="alert"]')).toBeNull()
    expect(months()[1].textContent).toContain(fmtDateRange('2026-04-13', '2026-04-26'))
  })

  it('a plan from before months is Month 1, open-ended, and gets four weeks once a second month comes', async () => {
    await mount(legacy())
    expect(titles()).toEqual(['Month 1'])
    expect(months()[0].textContent).toContain('Open-ended')
    expect(months()[0].querySelector('input[aria-label="Weeks"]').value).toBe('')
    expect(buttonIn(months()[0], 'Delete Month 1')).toBeUndefined()
    press(host, 'New month')
    expect(phases().map(p => p.weeks)).toEqual([4, 4])
    expect(host.textContent).toContain('Pick a start date')
    expect(host.textContent).not.toContain('Open-ended')
  })

  it('Use a model makes a month named after it from a copy of its plan', async () => {
    await mount()
    press(host, 'Use a model')
    expect(mocks.openSheet).toHaveBeenCalledTimes(1)
    const sheet = mocks.openSheet.mock.calls[0][0](() => {})
    const fromServer = bundle('Model day', 'm1')
    const kept = structuredClone(fromServer)
    act(() => sheet.props.onPick(fromServer, 'Strength base'))
    const made = phases()[2]
    expect(made).toMatchObject({ name: 'Strength base', weeks: 4 })
    expect(made.bundle).toEqual(kept)
    expect(made.bundle).not.toBe(fromServer)
    session.openPhase(made.id)
    act(() => session.store.getState().update(S => { S.routines[0].name = 'Changed'; S.routines[0].ex = [] }))
    session.current()
    expect(fromServer).toEqual(kept)
  })

  it('Save as model offers the month\'s plan, open edits included, under its name', async () => {
    await mount()
    act(() => session.store.getState().update(S => { S.routines[0].name = 'Push edited' }))
    press(months()[0], 'Save as model')
    const sheet = mocks.openSheet.mock.calls[0][0](() => {})
    expect(sheet.props.defaultName).toBe('Base')
    expect(sheet.props.bundle.routines[0].name).toBe('Push edited')
  })

  it('saves every change through the session', async () => {
    await mount()
    press(host, 'New month')
    await act(async () => { await new Promise(r => setTimeout(r, 850)) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][1].phases).toHaveLength(3)
  })
})
