// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Trainer mode (config.trainer_mode): the sign-in starts by asking who you are. A student signs
   in as anyone does but cannot make an account here; a trainer can. Without the mode the screen
   is the one it always was. */
const mocks = vi.hoisted(() => {
  const state = { webauthn: true, config: null, sheets: [] }
  state.snapshot = () => ({
    config: state.config, S: {},
    setUser: vi.fn(), adoptProfile: vi.fn(), setGuest: vi.fn(), loadConfig: vi.fn(async () => state.config),
    pushState: vi.fn(), pullState: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: render => { mocks.sheets.push(render); return {} } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => mocks.webauthn, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), BIO: 'your fingerprint', bio: () => 'your fingerprint',
  api: vi.fn(), passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn(), passwordResetRedeem: vi.fn(),
}))
vi.mock('../lib/demo.js', () => ({ DEMO: false, REPO: 'https://example.invalid' }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn(), confirmSheet: vi.fn() }))
vi.mock('../components/ServerSync.jsx', () => ({ leaveServer: vi.fn() }))

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const buttons = host => [...host.querySelectorAll('button')].map(b => b.textContent)
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const NOTICE = 'Only your personal trainer can create accounts. Ask your trainer for an invite link.'

beforeEach(() => { mocks.webauthn = true; mocks.config = null; mocks.sheets.length = 0 })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('Login in trainer mode', () => {
  it('without the mode there is no role choice and profiles are made as before', () => {
    mocks.config = { password_login: true }
    const page = mount(<Login />)
    expect(buttons(page)).not.toContain("I'm a student")
    expect(buttons(page)).toContain('Create new profile')
    expect(page.textContent).not.toContain(NOTICE)
  })

  it('asks first; a student gets the notice and no way to create a profile', () => {
    mocks.config = { trainer_mode: true, password_login: true, invite_only: true }
    const page = mount(<Login />)
    expect(buttons(page)).toEqual(["I'm a student", "I'm a personal trainer"])
    act(() => button(page, "I'm a student").click())
    expect(buttons(page)).toContain('Sign in with passkey')
    expect(buttons(page)).toContain('Sign in with password')
    expect(buttons(page)).not.toContain('Create new profile')
    expect(page.querySelector('input[placeholder="Invite code"]')).toBeNull()
    expect(page.textContent).toContain(NOTICE)
    act(() => button(page, 'Back').click())
    expect(buttons(page)).toEqual(["I'm a student", "I'm a personal trainer"])
  })

  it('a trainer signs in as anyone does, or creates a trainer account', () => {
    mocks.config = { trainer_mode: true }
    const page = mount(<Login />)
    act(() => button(page, "I'm a personal trainer").click())
    expect(buttons(page)).toContain('Sign in with passkey')
    expect(buttons(page)).not.toContain('Create new profile')
    expect(page.textContent).not.toContain(NOTICE)
    act(() => button(page, 'Create trainer account').click())
    expect(page.querySelector('h3').textContent).toBe('Create trainer account')
    expect(page.querySelector('input[placeholder="Phone (optional)"]')).toBeTruthy()
    act(() => button(page, 'Back').click())
    expect(buttons(page)).toContain('Create trainer account')
  })
})
