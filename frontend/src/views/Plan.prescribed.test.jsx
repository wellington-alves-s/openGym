// @vitest-environment happy-dom
// A routine the trainer prescribed (id rx-*, rx: { v }) can be trained and copied, never deleted
// from Plan; its place in the list stays the student's to move.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { closeOpenRow } from '../lib/use-swipe-row.js'
import Plan, { deleteRoutineWithUndo } from './Plan.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), beacon: vi.fn(), appBase: () => '/' }))
vi.mock('../sheets.jsx', () => ({
  dayAssignSheet: vi.fn(), starterPlanSheet: vi.fn(), menuSheet: vi.fn(), confirmSheet: vi.fn(),
  planHasRoutines: () => true, exportPlanFile: vi.fn(), printWholePlan: vi.fn(), importPlanFile: vi.fn(),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))
const mine = { id: 'own', name: 'My push', emoji: null, ex: [{ id: '0025' }] }
const rx = { id: 'rx-r1', name: 'Coach A', emoji: null, ex: [{ id: '0025' }], rx: { v: 2 }, excludeFromProgression: true }
let host, root, widthSpy

function mount(extra = {}) {
  localStorage.setItem('gym_plan_view', 'routines')
  const S = clone(DEF)
  Object.assign(S, { routines: [clone(mine), clone(rx)], week: {}, dayPlan: {} }, extra)
  useStore.setState({ S, user: null })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<Plan />))
}
const S = () => useStore.getState().S
const rowOf = name => [...host.querySelectorAll('.item.plan-routine')].find(r => r.querySelector('.tt')?.textContent === name)
const swrowOf = name => [...host.querySelectorAll('.swrow')].find(r => r.querySelector('.tt')?.textContent === name)
const click = target => act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
const tagOf = name => rowOf(name).querySelector('.tag')?.textContent

function pointer(target, type, x, y = 300) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y })
  act(() => { target.dispatchEvent(event) })
}
function swipe(target, x0, x1) {
  pointer(target, 'pointerdown', x0)
  pointer(target, 'pointermove', (x0 + x1) / 2)
  pointer(target, 'pointermove', x1)
  pointer(target, 'pointerup', x1)
  click(target)
  act(() => vi.advanceTimersByTime(800))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Element.prototype, 'animate').mockImplementation(function (_, o) {
    const a = { onfinish: null, cancel: () => clearTimeout(t) }
    const t = setTimeout(() => a.onfinish?.(), o?.duration || 0)
    return a
  })
  nav.mockClear()
  document.documentElement.dir = 'ltr'
  useUI.setState({ sheets: [], toastMsg: '', toastAction: null })
  widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360)
})
afterEach(() => {
  closeOpenRow(true)
  act(() => root.unmount()); host.remove()
  localStorage.removeItem('gym_plan_view')
  widthSpy.mockRestore()
  vi.clearAllTimers(); vi.useRealTimers()
  vi.mocked(Element.prototype.animate).mockRestore?.()
})

describe('a prescribed routine in the Routines list', () => {
  it('wears the Prescribed tag; the student’s own routine does not', () => {
    mount()
    expect(tagOf('Coach A')).toBe('Prescribed')
    expect(tagOf('My push')).toBeUndefined()
  })

  it('has no delete swipe (its copy side stays), the own routine keeps both', () => {
    mount()
    expect(swrowOf('Coach A').querySelector('.swpane.del')).toBeNull()
    expect(swrowOf('Coach A').querySelector('.swpane.cp')).toBeTruthy()
    expect(swrowOf('My push').querySelector('.swpane.del')).toBeTruthy()
  })

  it('a swipe toward the start does not delete it', () => {
    mount()
    swipe(swrowOf('Coach A'), 330, 60)
    expect(S().routines.map(r => r.id)).toEqual(['own', 'rx-r1'])
  })

  it('has no minus in Edit, but can still be moved', () => {
    mount()
    click(host.querySelector('.plan-textbtn'))
    expect(host.querySelector('button[aria-label="Delete Coach A"]')).toBeNull()
    expect(host.querySelector('button[aria-label="Delete My push"]')).toBeTruthy()
    expect(host.querySelector('button[aria-label="Move Coach A"]')).toBeTruthy()
  })

  it('deleteRoutineWithUndo refuses it and changes nothing', () => {
    mount()
    const before = clone(S())
    let ok
    act(() => { ok = deleteRoutineWithUndo('rx-r1') })
    expect(ok).toBe(false)
    expect(S().routines).toEqual(before.routines)
    expect(useUI.getState().toastMsg).toBe('')
  })

  it('copying it makes an own routine, with no rx and no progression exclusion', () => {
    mount()
    swipe(swrowOf('Coach A'), 100, 330)
    expect(S().routines).toHaveLength(3)
    const copy = S().routines[2]
    expect(copy.name).toBe('Coach A (Copy)')
    expect(copy.id).not.toBe('rx-r1')
    expect(copy.rx).toBeUndefined()
    expect(copy.excludeFromProgression).toBeUndefined()
    expect(S().routines[1].rx).toEqual({ v: 2 })
  })
})
