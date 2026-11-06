// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { addDays } from '../lib/program.js'
import { writeCache } from '../lib/prescription-cache.js'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
const { default: ProgramCard } = await import('./ProgramCard.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The student's card on Home: which month and week of the program, how far along, and the next
   training day. Fixed clock: Monday 16 November 2026, local noon. */
const TODAY = '2026-11-16'
let host, root, original

const phase = (id, week, name = '') => ({ id, name, weeks: 4, bundle: { opengym_plan: 1, unit: 'kg', week, routines: [], customEx: [] } })
const program = (start, phases) => ({ start, phases })
const own = (uid, prog, v = 3) => writeCache(uid, { v, program: prog })
const routines = [{ id: 'rx-b', name: 'Treino B', rx: { v: 3, p: 'p2' } }, { id: 'rx-c', name: 'Treino C', rx: { v: 3, p: 'p2' } }, { id: 'rx-d', name: 'Treino D', rx: { v: 3, p: 'p2' } }]
const THREE = [phase('p1', { 1: ['a'] }), phase('p2', { 3: ['b'] }), phase('p3', {})]
const mount = async () => { await act(async () => root.render(<ProgramCard />)) }
const setStore = (S = {}, user = { id: 'u1', role: 'student' }) => act(() => useStore.setState({ S: { ...structuredClone(DEF), routines, ...S }, user }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 16, 12))
  original = useStore.getState()
  nav.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState(original)
  localStorage.clear()
  vi.useRealTimers()
})

describe('ProgramCard', () => {
  it('shows month 2 of 3, week 3 of 4, the bar and the next day', async () => {
    own('u1', program(addDays(TODAY, -44), THREE))
    setStore()
    await mount()
    expect(host.textContent).toContain('Month 2 of 3')
    expect(host.textContent).toContain('Week 3 of 4')
    expect(host.textContent).toContain('Next: Treino B, Wednesday')
    const bar = host.querySelector('[role="progressbar"]')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-valuenow')).toBe('52')
    expect(bar.getAttribute('aria-label')).toBeTruthy()
  })

  it('keeps the month count and adds the phase name, and says Today when the day is today', async () => {
    const p = [phase('p1', {}), phase('p2', { 1: ['b', 'c', 'd'] }, 'Strength')]
    own('u1', program(addDays(TODAY, -30), p))
    setStore()
    await mount()
    expect(host.textContent).toContain('Month 2 of 2 · Strength')
    expect(host.textContent).toContain('Next: Treino B + Treino C +1, Today')
  })

  it('before the start: the date and the first month, never week 0', async () => {
    own('u1', program(addDays(TODAY, 10), THREE))
    setStore()
    await mount()
    expect(host.textContent).toContain('Starts on')
    expect(host.textContent).toContain('Month 1 of 3')
    expect(host.textContent).not.toContain('Week 0')
    expect(host.textContent).not.toContain('Next:')
  })

  it('after the end: the program is finished and the bar is full', async () => {
    own('u1', program(addDays(TODAY, -400), THREE))
    setStore()
    await mount()
    expect(host.textContent).toContain('Program finished')
    expect(host.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100')
  })

  it('a single open phase shows the name and the next day, no week and no bar', async () => {
    own('u1', program(null, [{ id: 'p1', name: '', weeks: 0, bundle: { opengym_plan: 1, unit: 'kg', week: { 3: ['b'] }, routines: [], customEx: [] } }]))
    setStore()
    await mount()
    expect(host.textContent).toContain('Month 1')
    expect(host.textContent).toContain('Next: Treino B, Wednesday')
    expect(host.textContent).not.toContain('Week')
    expect(host.querySelector('[role="progressbar"]')).toBeNull()
  })

  it('a single named phase reads "Month 1 · Name"', async () => {
    own('u1', program(null, [{ ...phase('p1', {}, 'Base'), weeks: 0 }]))
    setStore()
    await mount()
    expect(host.textContent).toContain('Month 1 · Base')
  })

  it('a rest month still shows, without a Next line', async () => {
    own('u1', program(addDays(TODAY, -60), THREE))   // week 9 of 12: month 3, nothing on any day
    setStore({ routines: [] })
    await mount()
    expect(host.textContent).toContain('Month 3 of 3')
    expect(host.querySelector('[role="progressbar"]')).toBeTruthy()
    expect(host.textContent).not.toContain('Next:')
  })

  it('leaves out a routine it cannot find, and the Next line when none is found', async () => {
    own('u1', program(addDays(TODAY, -44), THREE))
    setStore({ routines: [] })
    await mount()
    expect(host.textContent).not.toContain('Next:')
  })

  it('renders nothing without a cache, without a user, or for another account\'s cache', async () => {
    setStore()
    await mount()
    expect(host.innerHTML).toBe('')
    own('u2', program(addDays(TODAY, -44), THREE))
    await mount()
    expect(host.innerHTML).toBe('')
    own('u1', program(addDays(TODAY, -44), THREE))
    setStore({}, null)
    await mount()
    expect(host.innerHTML).toBe('')
  })

  it('renders nothing for a cache without a phase', async () => {
    own('u1', program(null, []))
    setStore()
    await mount()
    expect(host.innerHTML).toBe('')
  })

  it('opens the plan when tapped', async () => {
    own('u1', program(addDays(TODAY, -44), THREE))
    setStore()
    await mount()
    act(() => host.querySelector('[role="button"]').click())
    expect(nav).toHaveBeenCalledWith('/plan')
  })

  it('follows the applied plan: a new version of the routines redraws the card', async () => {
    own('u1', program(addDays(TODAY, -44), THREE))
    setStore()
    await mount()
    expect(host.textContent).toContain('Month 2 of 3')
    own('u1', program(addDays(TODAY, -60), THREE))
    setStore({ routines: routines.map(r => ({ ...r, rx: { v: 4, p: 'p3' } })) })
    expect(host.textContent).toContain('Month 3 of 3')
  })
})
