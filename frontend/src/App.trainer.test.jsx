// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { getModel, getRx, saveRxDraft } from './lib/trainer-api.js'
import { dropSession } from './views/trainer/PrescriptionWorkspace.jsx'
import { dropSession as dropModel } from './views/trainer/ModelWorkspace.jsx'

vi.mock('./lib/sound.js', () => ({
  setPlayOnSilent: vi.fn(), setVibrate: vi.fn(), setAlarmBuzzer: vi.fn(),
  beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn(),
}))
vi.mock('./lib/api.js', async importOriginal => ({
  ...await importOriginal(), api: vi.fn(() => Promise.resolve({})), beacon: vi.fn(),
}))
// Two months with a routine of the same id each: the editor must open the one of the month in the path.
const month = (id, name) => ({ id, name: '', weeks: 4, bundle: { opengym_plan: 1, unit: 'kg', week: {}, customEx: [],
  routines: [{ id: 'r1', name, emoji: 'dumbbell', ex: [{ id: '0025', sets: 3, reps: 5, weight: 60 }] }] } })
const draftRx = { _rev: 3, current: null, versions: [], draft: { updated: 1, program: { start: null, phases: [month('p1', 'Draft push day'), month('p2', 'Draft pull day')] } } }
vi.mock('./lib/trainer-api.js', () => ({
  listStudents: vi.fn(async () => []), studentRxRev: vi.fn(async () => ({ v: null })), studentRx: vi.fn(),
  getRx: vi.fn(async () => ({ rx: draftRx })), saveRxDraft: vi.fn(async () => ({ rx: draftRx })),
  getModel: vi.fn(async () => ({ model: { id: 'm1', name: 'Base', _rev: 1, updated: 1, bundle: { opengym_plan: 1, unit: 'kg', week: {}, customEx: [],
    routines: [{ id: 'r1', name: 'Model day', emoji: 'dumbbell', ex: [{ id: '0025', sets: 3, reps: 5, weight: 60 }] }] } } })),
  saveModel: vi.fn(), listModels: vi.fn(async () => []),
}))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original

beforeEach(() => {
  original = useStore.getState()
  window.scrollTo = vi.fn()
  useUI.setState({ sheets: [], work: null, timer: null })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState(original)
  localStorage.clear()
  dropSession('abc')
  dropModel('m1')
})

const signIn = (user, extra = {}) => useStore.setState({ S: structuredClone(DEF), user, ready: true, boot: vi.fn(), ...extra })
const approved = { id: 't1', name: 'Carla', role: 'trainer', trainerStatus: 'approved' }
const open = async hash => { window.location.hash = hash; await act(async () => root.render(<App />)) }

/* An approved trainer reaches the students and their own settings; any other link lands on the
   students. Nobody else's routes change. */
describe('an approved trainer', () => {
  it.each(['#/home', '#/stats', '#/workout', '#/plan', '#/library', '#/admin', '#/pending', '#/nowhere'])('%s lands on /students', async hash => {
    signIn(approved)
    await open(hash)
    expect(window.location.hash).toBe('#/students')
    expect(host.textContent).toContain('No students yet.')
  })

  it('keeps /settings, and a settings page', async () => {
    signIn(approved)
    await open('#/settings')
    expect(window.location.hash).toBe('#/settings')
    await open('#/settings/units')
    expect(window.location.hash).toBe('#/settings/units')
  })

  it('reaches a routine of a month of a student’s draft in the editor, with Students lit in the bar', async () => {
    signIn(approved)
    await open('#/students/abc/plan/p2/r1')
    // The draft, then the lazy editor chunk.
    const nameField = () => [...host.querySelectorAll('input')].find(i => i.value === 'Draft pull day')
    for (let i = 0; i < 40 && !nameField(); i++) await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(window.location.hash).toBe('#/students/abc/plan/p2/r1')
    expect(nameField()).toBeTruthy()
    expect(host.querySelector('#tabbar button.on').textContent).toBe('Students')
    expect(useStore.getState().S.routines.some(r => r.id === 'r1')).toBe(false)
  })

  it('reaches a routine of a model in the editor, with Models lit in the bar', async () => {
    signIn(approved)
    await open('#/models/m1/plan/r1')
    const nameField = () => [...host.querySelectorAll('input')].find(i => i.value === 'Model day')
    for (let i = 0; i < 40 && !nameField(); i++) await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(window.location.hash).toBe('#/models/m1/plan/r1')
    expect(nameField()).toBeTruthy()
    expect(getModel).toHaveBeenCalledWith('m1')
    expect(host.querySelector('#tabbar button.on').textContent).toBe('Models')
  })

  it('has the three-tab bar, and skips the lifter onboarding and permission steps', async () => {
    signIn(approved, { needsMobileOnboarding: true, permSteps: true })
    await open('#/students')
    expect([...host.querySelectorAll('#tabbar button')].map(b => b.textContent)).toEqual(['Students', 'Models', 'Profile'])
    expect(host.textContent).toContain('No students yet.')
  })
})

describe('everyone else', () => {
  it.each([
    ['a student', { id: 's1', name: 'Lee', role: 'student' }],
    ['an account without a role', { id: 'u1', name: 'Lee' }],
  ])('%s never sees /students', async (_, user) => {
    signIn(user)
    await open('#/students')
    expect(window.location.hash).toBe('#/home')
    expect(host.querySelectorAll('#tabbar button')).toHaveLength(5)
  })

  it.each([
    ['a student', { id: 's1', name: 'Lee', role: 'student' }],
    ['an account without a role', { id: 'u1', name: 'Lee' }],
    ['a pending trainer', { id: 't2', name: 'Lee', role: 'trainer', trainerStatus: 'pending' }],
  ])('%s never reaches /models', async (_, user) => {
    signIn(user)
    await open('#/models/m1/plan')
    expect(window.location.hash).not.toMatch(/models/)
  })
})

// The owner can be a trainer too, and keeps the admin dashboard (approving trainers, trainer mode).
describe('an approved trainer and the admin dashboard', () => {
  it('who is the owner can open /admin', async () => {
    signIn({ ...approved, admin: true })
    await open('#/admin')
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })   // the lazy chunk
    expect(window.location.hash).toBe('#/admin')
  })

  it('who is not the owner is sent to /students', async () => {
    signIn(approved)
    await open('#/admin')
    expect(window.location.hash).toBe('#/students')
  })
})

/* App keys each page on its path, so the program, a month and the editor are separate mounts of the
   plan's layout. The draft, and edits not yet on the server, must survive the trip between them. */
describe('an approved trainer moving through a student plan', () => {
  const until = async ok => { for (let i = 0; i < 60 && !ok(); i++) await act(async () => { await new Promise(r => setTimeout(r, 25)) }) }
  const nameField = () => [...host.querySelectorAll('input.input')].find(i => /day/.test(i.value))
  const routineRow = () => host.querySelector('.card [role="button"]')
  const monthRow = n => host.querySelectorAll('ul.months [role="button"]')[n]
  const back = to => act(async () => host.querySelector(`button[data-back="${to}"]`).click())
  const backToList = () => back('/students/abc/plan/p1')
  const type = (el, value) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })

  it('keeps the draft and unsent edits between the program, the months and the editor, and saves them once it can', async () => {
    getRx.mockClear()
    saveRxDraft.mockReset()
    saveRxDraft.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }))
    signIn(approved)
    await open('#/students/abc/plan')
    await until(() => monthRow(1))
    expect([...host.querySelectorAll('ul.months .tt')].map(e => e.textContent)).toEqual(['Month 1', 'Month 2'])
    await act(async () => monthRow(0).click())
    await until(() => host.textContent.includes('Draft push day'))
    expect(window.location.hash).toBe('#/students/abc/plan/p1')
    await act(async () => routineRow().click())
    await until(nameField)
    expect(window.location.hash).toBe('#/students/abc/plan/p1/r1')
    type(nameField(), 'Edited day')
    await backToList()
    // The list has the edit at once, from the same store: no second read, no blank page.
    expect(window.location.hash).toBe('#/students/abc/plan/p1')
    expect(host.textContent).toContain('Edited day')
    // Another month, then the program: the first month keeps its edit.
    await back('/students/abc/plan')
    await act(async () => monthRow(1).click())
    await until(() => host.textContent.includes('Draft pull day'))
    expect(host.textContent).not.toContain('Edited day')
    await back('/students/abc/plan')
    expect(window.location.hash).toBe('#/students/abc/plan')
    await act(async () => monthRow(0).click())
    await until(() => host.textContent.includes('Edited day'))
    await until(() => saveRxDraft.mock.calls.length > 0)
    expect(getRx).toHaveBeenCalledTimes(1)
    // The save failed (offline); the edit is still there after another round trip.
    await act(async () => routineRow().click())
    await until(nameField)
    expect(nameField().value).toBe('Edited day')
    saveRxDraft.mockReset()
    saveRxDraft.mockImplementation(async (sid, program, rev) => ({ rx: { ...draftRx, _rev: rev + 1 } }))
    await backToList()
    await until(() => saveRxDraft.mock.calls.length > 0)
    const [sid, program, rev] = saveRxDraft.mock.calls[0]
    expect(sid).toBe('abc')
    expect(program.phases.map(ph => ph.bundle.routines[0].name)).toEqual(['Edited day', 'Draft pull day'])
    expect(rev).toBe(3)
    expect(getRx).toHaveBeenCalledTimes(1)
  })

  it('a month the program does not have goes to the program', async () => {
    signIn(approved)
    await open('#/students/abc/plan/gone/r1')
    await until(() => window.location.hash === '#/students/abc/plan' && monthRow(0))
    expect(window.location.hash).toBe('#/students/abc/plan')
    expect(monthRow(0)).toBeTruthy()
  })
})
