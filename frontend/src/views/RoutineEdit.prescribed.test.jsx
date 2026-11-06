// @vitest-environment happy-dom
// The editor of a routine the trainer prescribed (rx: { v }): the student reads it, copies it and
// trains it, but cannot change what is in it.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoutineEdit from './RoutineEdit.jsx'
import { DEF, useStore } from '../store/useStore.js'

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
let root, container

function renderRoutine(routine) {
  const S = clone(DEF)
  S.routines = [{ id: 'rx-r1', name: 'Coach A', emoji: 'dumbbell', ex: [ex('0025'), ex('0334')], rx: { v: 3 }, excludeFromProgression: true, ...routine }]
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(
    <MemoryRouter initialEntries={['/routine/rx-r1']}>
      <Routes><Route path="/routine/:id" element={<RoutineEdit />} /></Routes>
    </MemoryRouter>
  ))
}
const R = () => useStore.getState().S.routines
const buttonWith = text => [...container.querySelectorAll('button')].find(b => b.textContent.includes(text))

beforeEach(() => { localStorage.clear(); Object.values(sheets).forEach(f => f.mockClear()) })
afterEach(() => {
  if (root) act(() => root.unmount())
  if (container) container.remove()
  root = null; container = null
})

describe('a prescribed routine in the editor', () => {
  it('says who prescribed it and which version', () => {
    renderRoutine()
    expect(container.textContent).toContain('Prescribed by your trainer')
    expect(container.textContent).toContain('Version 3')
  })

  it('has no add, move, link, delete or progression control', () => {
    renderRoutine()
    expect(buttonWith('Add exercise')).toBeUndefined()
    expect(container.querySelector('[aria-label="Move up"]')).toBeNull()
    expect(container.querySelector('[aria-label="Move down"]')).toBeNull()
    expect(container.querySelector('[title="Superset with exercise above"]')).toBeNull()
    expect(buttonWith('Delete routine')).toBeUndefined()
    expect(container.textContent).not.toContain('Progression')
    expect(container.textContent).not.toContain('Deload routine')
    expect(container.querySelector('[role="switch"]')).toBeNull()
  })

  it('keeps the name read-only and the icon button inert', () => {
    renderRoutine()
    const name = container.querySelector('input.input')
    expect(name.readOnly).toBe(true)
    const icon = container.querySelector('[aria-label="Pick an icon"]')
    expect(icon.disabled).toBe(true)
    act(() => icon.click())
    expect(sheets.glyphPicker).not.toHaveBeenCalled()
    expect(R()[0].name).toBe('Coach A')
  })

  it('opens the exercise’s details, not its configuration, when a row is tapped', () => {
    renderRoutine()
    act(() => container.querySelector('.item-open').click())
    expect(sheets.exConfigSheet).not.toHaveBeenCalled()
    expect(sheets.exerciseDetailSheet).toHaveBeenCalledTimes(1)
    expect(sheets.exerciseDetailSheet.mock.calls[0][0].id).toBe('0025')
  })

  it('does not swipe an exercise away', () => {
    renderRoutine()
    expect(container.querySelector('.swrow')).toBeNull()
  })

  it('still copies it, and the copy is the student’s own', () => {
    renderRoutine()
    act(() => buttonWith('Copy routine').click())
    expect(R()).toHaveLength(2)
    expect(R()[1].rx).toBeUndefined()
    expect(R()[1].excludeFromProgression).toBeUndefined()
    expect(R()[0].rx).toEqual({ v: 3 })
  })

  it('an own routine keeps every control and no badge', () => {
    renderRoutine({ id: 'rx-r1', rx: undefined, excludeFromProgression: undefined })
    expect(container.textContent).not.toContain('Prescribed by your trainer')
    expect(buttonWith('Add exercise')).toBeTruthy()
    expect(buttonWith('Delete routine')).toBeTruthy()
    expect(container.querySelector('input.input').readOnly).toBe(false)
  })
})
