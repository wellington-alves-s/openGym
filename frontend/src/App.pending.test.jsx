// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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

const signIn = user => useStore.setState({ S: structuredClone(DEF), user, ready: true, boot: vi.fn() })

// A trainer the owner has not approved yet has one place to be, whatever the link says.
it('a pending trainer lands on /pending, with no tabs, from any route', async () => {
  signIn({ id: 'u1', name: 'Carla', role: 'trainer', trainerStatus: 'pending' })
  window.location.hash = '#/stats'
  await act(async () => root.render(<App />))
  expect(window.location.hash).toBe('#/pending')
  expect(host.textContent).toContain('Waiting for the owner to approve your account')
  expect(host.querySelector('#tabbar')).toBeNull()
})

it('an account without a role never sees /pending', async () => {
  signIn({ id: 'u2', name: 'Lee' })
  window.location.hash = '#/pending'
  await act(async () => root.render(<App />))
  expect(window.location.hash).toBe('#/home')
  expect(host.textContent).not.toContain('Waiting for the owner')
})
