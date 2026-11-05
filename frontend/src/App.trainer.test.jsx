// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'

vi.mock('./lib/sound.js', () => ({
  setPlayOnSilent: vi.fn(), setVibrate: vi.fn(), setAlarmBuzzer: vi.fn(),
  beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn(),
}))
vi.mock('./lib/api.js', async importOriginal => ({
  ...await importOriginal(), api: vi.fn(() => Promise.resolve({})), beacon: vi.fn(),
}))
vi.mock('./lib/trainer-api.js', () => ({ listStudents: vi.fn(async () => []) }))
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

  it('has the two-tab bar, and skips the lifter onboarding and permission steps', async () => {
    signIn(approved, { needsMobileOnboarding: true, permSteps: true })
    await open('#/students')
    expect([...host.querySelectorAll('#tabbar button')].map(b => b.textContent)).toEqual(['Students', 'Profile'])
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
