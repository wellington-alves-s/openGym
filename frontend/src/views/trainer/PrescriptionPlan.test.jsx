// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PrescriptionPlan from './PrescriptionPlan.jsx'
import { DEF } from '../../store/useStore.js'
import { WorkspaceContext, createWorkspaceStore } from '../../lib/workspace.js'
import { DEFAULT_GLYPH } from '../../lib/glyphs.js'
import { DraftSessionContext, PhaseGate, createDraftSessions } from '../../lib/draft-session.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The routines of a student's draft: make one, delete one once confirmed, put one on weekdays. */
const mocks = vi.hoisted(() => ({ confirmSheet: vi.fn() }))
vi.mock('../../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirmSheet(...a) }))

let ws, host, root
function mount() {
  ws = createWorkspaceStore(structuredClone(DEF), { opengym_plan: 1, unit: 'kg', week: { 3: ['r1'] }, routines: [
    { id: 'r1', name: 'Push', emoji: 'dumbbell', ex: [{ id: '0025' }] },
    { id: 'r2', name: 'Pull', emoji: 'dumbbell', ex: [] },
  ], customEx: [] }, { backTo: '/students/abc/plan/p1' })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<WorkspaceContext.Provider value={ws}><MemoryRouter initialEntries={['/students/abc/plan/p1']}>
    <Routes>
      <Route path="/students/:sid/plan/:phase" element={<PrescriptionPlan />} />
      <Route path="/students/:sid/plan/:phase/:id" element={<p>editor</p>} />
      <Route path="/students/:sid/plan" element={<p>program</p>} />
    </Routes>
  </MemoryRouter></WorkspaceContext.Provider>))
}
const S = () => ws.getState().S
const row = name => [...host.querySelectorAll('li')].find(li => li.querySelector('.tt').textContent === name)
const press = (el, text) => act(() => [...el.querySelectorAll('button')].find(b => b.textContent === text || b.getAttribute('aria-label') === text).click())

beforeEach(() => mocks.confirmSheet.mockReset())
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('PrescriptionPlan', () => {
  it('lists the draft\'s routines', () => {
    mount()
    expect([...host.querySelectorAll('li .tt')].map(e => e.textContent)).toEqual(['Push', 'Pull'])
  })

  it('makes a new routine the way the Plan does and opens it', () => {
    mount()
    press(host, 'New routine')
    const made = S().routines[2]
    expect(made).toMatchObject({ name: 'New routine', emoji: DEFAULT_GLYPH, ex: [] })
    expect(made.id).toMatch(/^[\w-]{1,64}$/)
    expect(host.textContent).toContain('editor')
  })

  it('a tap on a routine opens it in the editor', () => {
    mount()
    act(() => row('Pull').querySelector('[role="button"]').click())
    expect(host.textContent).toContain('editor')
  })

  it('deletes a routine only once confirmed, and its weekdays with it', async () => {
    mount()
    press(row('Push'), 'Delete Push')
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(S().routines).toHaveLength(2)
    act(() => mocks.confirmSheet.mock.calls[0][0].onConfirm())
    expect(S().routines.map(r => r.id)).toEqual(['r2'])
    expect(S().week[3]).toBeUndefined()
  })

  it('a weekday chip puts the routine on that day and takes it off again', () => {
    mount()
    const monday = () => [...row('Pull').querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Monday')
    expect(monday().getAttribute('aria-pressed')).toBe('false')
    act(() => monday().click())
    expect(S().week[1]).toEqual(['r2'])
    expect(monday().getAttribute('aria-pressed')).toBe('true')
    act(() => [...row('Push').querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Monday').click())
    expect(S().week[1]).toEqual(['r2', 'r1'])
    act(() => monday().click())
    expect(S().week[1]).toEqual(['r1'])
    act(() => [...row('Push').querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Monday').click())
    expect(S().week[1]).toBeUndefined()
  })

  it('goes back to the program', () => {
    mount()
    act(() => host.querySelector('button[data-back="/students/abc/plan"]').click())
    expect(host.textContent).toContain('program')
  })
})

/* Inside a program, the page is one month: what it makes and puts on a day lands in that month only. */
describe('PrescriptionPlan in a month of a program', () => {
  const b = (id, name) => ({ opengym_plan: 1, unit: 'kg', week: {}, routines: [{ id, name, emoji: 'dumbbell', ex: [] }], customEx: [] })
  let reg, session, release
  async function mountMonth(phase) {
    reg = createDraftSessions({ load: async () => ({ program: { start: null, phases: [{ id: 'p1', name: 'Base', weeks: 4, bundle: b('r1', 'Push') }, { id: 'p2', name: '', weeks: 4, bundle: b('r2', 'Pull') }] }, rev: 1 }),
      save: async (k, p, rev) => ({ rev: rev + 1 }), backTo: (sid, id) => `/students/${sid}/plan/${id}` })
    const leave = reg.page('abc')
    session = await reg.ensure('abc')
    release = [leave, reg.acquire(session)]
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => root.render(<DraftSessionContext.Provider value={session}><WorkspaceContext.Provider value={session.store}>
      <MemoryRouter initialEntries={['/students/abc/plan/' + phase]}><Routes>
        <Route path="/students/:sid/plan/:phase" element={<PhaseGate />}>
          <Route index element={<PrescriptionPlan />} />
          <Route path=":id" element={<p>editor</p>} />
        </Route>
      </Routes></MemoryRouter>
    </WorkspaceContext.Provider></DraftSessionContext.Provider>))
  }
  afterEach(() => { release.forEach(f => f()); reg.dropSession('abc') })

  it('is titled with the month, makes a routine in it and opens it there', async () => {
    await mountMonth('p2')
    expect(host.querySelector('h2').textContent).toBe('Month 2')
    expect([...host.querySelectorAll('li .tt')].map(e => e.textContent)).toEqual(['Pull'])
    press(host, 'New routine')
    expect(host.textContent).toContain('editor')
    const program = session.current()
    expect(program.phases[1].bundle.routines.map(r => r.name)).toEqual(['Pull', 'New routine'])
    expect(program.phases[0].bundle.routines.map(r => r.name)).toEqual(['Push'])
  })

  it('a weekday chip changes the week of that month only', async () => {
    await mountMonth('p1')
    act(() => [...row('Push').querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Monday').click())
    const program = session.current()
    expect(program.phases[0].bundle.week[1]).toEqual(['r1'])
    expect(program.phases[1].bundle.week).toEqual({})
  })
})
