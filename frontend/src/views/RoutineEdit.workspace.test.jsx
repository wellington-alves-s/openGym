// @vitest-environment happy-dom
// The routine editor on a pluggable store (stage 2a): inside a WorkspaceContext provider it reads
// and writes the workspace's plan (a trainer editing a student's draft), the user's own plan stays
// as it was, and the pieces that belong to the user's own plan (print, progression, copy) are gone.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoutineEdit from './RoutineEdit.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { WorkspaceContext, createWorkspaceStore } from '../lib/workspace.js'

vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
const sheets = vi.hoisted(() => ({
  glyphPicker: vi.fn(), exercisePicker: vi.fn(), exConfigSheet: vi.fn(), confirmSheet: vi.fn(),
  supersetSheet: vi.fn(), exerciseDetailSheet: vi.fn(),
}))
vi.mock('../sheets.jsx', () => sheets)
vi.mock('../components/Media.jsx', () => ({ Thumb: () => null }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))
const ex = (id, extra = {}) => ({ id, sets: 3, reps: 8, weight: 40, ...extra })
let root, container, ws, ownBefore

function mount({ provider = true } = {}) {
  const S = clone(DEF)
  S.routines = [{ id: 'own', name: 'My own', emoji: 'dumbbell', ex: [ex('0025')] }]
  useStore.setState({ S, user: { name: 'Trainer' } })
  ownBefore = JSON.stringify(useStore.getState().S)
  ws = createWorkspaceStore(S, { opengym_plan: 1, unit: 'kg', week: { 1: ['d1'] }, routines: [{ id: 'd1', name: 'Draft A', emoji: 'dumbbell', ex: [ex('0025'), ex('0334')] }], customEx: [] }, { backTo: '/trainer/s/stu1' })
  const editor = <MemoryRouter initialEntries={[provider ? '/rx/d1' : '/plan/r/own']}>
    <Routes>
      <Route path="/rx/:id" element={<RoutineEdit />} />
      <Route path="/plan/r/:id" element={<RoutineEdit />} />
      <Route path="/trainer/s/stu1" element={<p>student page</p>} />
      <Route path="/plan" element={<p>own plan</p>} />
    </Routes>
  </MemoryRouter>
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(provider ? <WorkspaceContext.Provider value={ws}>{editor}</WorkspaceContext.Provider> : editor))
}
const draft = () => ws.getState().S.routines[0]
const buttonWith = text => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text))
const ownUntouched = () => expect(JSON.stringify(useStore.getState().S)).toBe(ownBefore)

beforeEach(() => { localStorage.clear(); Object.values(sheets).forEach(f => f.mockReset()) })
afterEach(() => {
  if (root) act(() => root.unmount())
  if (container) container.remove()
  root = null; container = null
})

describe('the routine editor inside a workspace', () => {
  it('edits the name in the workspace, not in the user’s own plan', () => {
    mount()
    const input = container.querySelector('input.input')
    expect(input.value).toBe('Draft A')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    act(() => { set.call(input, 'Push day'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(draft().name).toBe('Push day')
    ownUntouched()
  })

  it('adds and removes an exercise in the workspace, with an undo that stays there', () => {
    mount()
    act(() => buttonWith('Add exercise').click())
    act(() => sheets.exercisePicker.mock.calls[0][0]({ id: '0662', name: 'x' }, true))
    expect(draft().ex.map(e => e.id)).toEqual(['0025', '0334', '0662'])
    act(() => container.querySelector('.item-open').click())
    const remove = sheets.exConfigSheet.mock.calls[0][3]
    act(() => remove())
    expect(draft().ex.map(e => e.id)).toEqual(['0334', '0662'])
    act(() => useUI.getState().runToastAction())
    expect(draft().ex.map(e => e.id)).toEqual(['0025', '0334', '0662'])
    ownUntouched()
  })

  it('goes back to backTo, and has no print, progression or copy', () => {
    mount()
    expect(container.querySelector('[data-back]').getAttribute('data-back')).toBe('/trainer/s/stu1')
    expect(buttonWith('Print')).toBeUndefined()
    expect(buttonWith('Copy routine')).toBeUndefined()
    expect(container.textContent).not.toContain('Progression')
    expect(container.textContent).not.toContain('Deload routine')
    act(() => container.querySelector('[data-back]').click())
    expect(container.textContent).toContain('student page')
  })

  it('deletes the routine from the workspace and goes back to backTo', () => {
    mount()
    act(() => buttonWith('Delete routine').click())
    act(() => sheets.confirmSheet.mock.calls[0][0].onConfirm())
    expect(ws.getState().S.routines).toEqual([])
    expect(ws.getState().S.week).toEqual({})
    expect(container.textContent).toContain('student page')
    ownUntouched()
  })

  it('without a provider it edits the user’s own plan as always', () => {
    mount({ provider: false })
    expect(container.querySelector('[data-back]').getAttribute('data-back')).toBe('/plan')
    expect(buttonWith('Print')).toBeTruthy()
    expect(buttonWith('Copy routine')).toBeTruthy()
    expect(container.textContent).toContain('Progression')
    act(() => container.querySelector('.item-open').click())
    act(() => sheets.exConfigSheet.mock.calls[0][3]())
    expect(useStore.getState().S.routines[0].ex).toEqual([])
    act(() => container.querySelector('[data-back]').click())
    expect(container.textContent).toContain('own plan')
  })
})
