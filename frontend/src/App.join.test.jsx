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
vi.mock('./views/Login.jsx', () => ({ default: () => <div>LOGIN</div> }))
vi.mock('./views/Join.jsx', () => ({ default: ({ code }) => <div>JOIN {code}</div> }))
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
  window.history.replaceState({}, '', '/')
})

const state = user => useStore.setState({ S: structuredClone(DEF), user, ready: true, boot: vi.fn() })

// The link a trainer sends: nobody is signed in, so the sign-in screen gives way to the invite.
it('?join= with nobody signed in opens the invite instead of the sign-in screen', async () => {
  state(null)
  window.history.replaceState({}, '', '/?join=AAAA-BBBB-CCCC')
  await act(async () => root.render(<App />))
  expect(host.textContent).toContain('JOIN AAAA-BBBB-CCCC')
  expect(host.textContent).not.toContain('LOGIN')
  expect(window.location.search).toBe('')
})

it('a signed-in user is never given the invite: it is ignored and taken off the address', async () => {
  state({ id: 'u2', name: 'Lee' })
  window.history.replaceState({}, '', '/?join=AAAA-BBBB-CCCC')
  await act(async () => root.render(<App />))
  expect(host.textContent).not.toContain('JOIN')
  expect(window.location.search).toBe('')
})

const SIGNED_IN = 'You are already signed in. Sign out first to accept this invite.'
let realToast
const spyToast = () => { realToast = useUI.getState().toast; const toast = vi.fn(); useUI.setState({ toast }); return toast }
afterEach(() => { if (realToast) useUI.setState({ toast: realToast }); realToast = null })

it('a signed-in browser opening an invite says so, once', async () => {
  const toast = spyToast()
  state({ id: 'u2', name: 'Lee' })
  window.history.replaceState({}, '', '/?join=AAAA-BBBB-CCCC')
  await act(async () => root.render(<App />))
  await act(async () => useStore.setState({ user: { id: 'u2', name: 'Lee B' } }))
  expect(toast.mock.calls.filter(c => c[0] === SIGNED_IN)).toHaveLength(1)
})

it('a guest opening an invite is told too', async () => {
  const toast = spyToast()
  state(null)
  useStore.setState({ isGuest: () => true })
  window.history.replaceState({}, '', '/?join=AAAA-BBBB-CCCC')
  await act(async () => root.render(<App />))
  expect(toast.mock.calls.filter(c => c[0] === SIGNED_IN)).toHaveLength(1)
})

it('the student who just joined through the invite is not told anything', async () => {
  const toast = spyToast()
  state(null)
  window.history.replaceState({}, '', '/?join=AAAA-BBBB-CCCC')
  await act(async () => root.render(<App />))
  expect(host.textContent).toContain('JOIN AAAA-BBBB-CCCC')
  await act(async () => useStore.setState({ user: { id: 's1', name: 'Rita', role: 'student' } }))
  expect(toast.mock.calls.filter(c => c[0] === SIGNED_IN)).toHaveLength(0)
})

it('without ?join= the sign-in screen is unchanged', async () => {
  state(null)
  await act(async () => root.render(<App />))
  expect(host.textContent).toContain('LOGIN')
  expect(host.textContent).not.toContain('JOIN')
})
