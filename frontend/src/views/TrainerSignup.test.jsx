// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TrainerSignup from './TrainerSignup.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A personal trainer creates their own account, with the form a profile is made with plus a
   phone, and the server is told it is a trainer. It then waits for the owner, unless it is the
   first account on the server, which is approved at once. */
const mocks = vi.hoisted(() => {
  const state = { webauthn: false, config: { password_login: true } }
  state.setUser = vi.fn()
  state.toast = vi.fn()
  state.passwordRegister = vi.fn()
  state.passkeyRegister = vi.fn()
  state.snapshot = () => ({
    S: {}, config: state.config, setUser: state.setUser, loadConfig: vi.fn(async () => state.config),
    pushState: vi.fn(async () => {}), pullState: vi.fn(async () => {}),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => mocks.webauthn, bio: () => 'your fingerprint', api: vi.fn(), passkeyAssertion: vi.fn(),
  passwordLogin: vi.fn(), passwordResetRedeem: vi.fn(), passkeyError: (e, fallback) => e?.message || fallback,
  passwordRegister: (...a) => mocks.passwordRegister(...a), passkeyRegister: (...a) => mocks.passkeyRegister(...a),
}))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn() }))
vi.mock('../components/ServerSync.jsx', () => ({ leaveServer: vi.fn() }))

const fail = (status, data) => Object.assign(new Error(data?.error || 'HTTP ' + status), { status, data })
const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
function type(el, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const byPlaceholder = (host, p) => host.querySelector(`input[placeholder="${p}"]`)
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const submit = async host => { act(() => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }
const fillPassword = host => {
  type(byPlaceholder(host, 'Your name'), 'Carla')
  type(byPlaceholder(host, 'Phone (optional)'), '+55 11 9999')
  type(byPlaceholder(host, 'Password'), 'correct horse battery')
  type(byPlaceholder(host, 'Repeat the password'), 'correct horse battery')
}

beforeEach(() => {
  mocks.webauthn = false
  mocks.config = { password_login: true }
  mocks.setUser.mockClear(); mocks.passwordRegister.mockReset(); mocks.passkeyRegister.mockReset()
})
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('TrainerSignup', () => {
  it('sends as: trainer and the phone, then waits for the owner', async () => {
    mocks.passwordRegister.mockResolvedValue({ id: 'u1', name: 'Carla', role: 'trainer', trainerStatus: 'pending' })
    const onDone = vi.fn()
    const page = mount(<TrainerSignup onDone={onDone} onBack={() => {}} />)
    expect(page.querySelector('h3').textContent).toBe('Create trainer account')
    const phone = byPlaceholder(page, 'Phone (optional)')
    expect(phone.type).toBe('tel')
    expect(phone.getAttribute('autocomplete')).toBe('tel')
    expect(byPlaceholder(page, 'Invite code')).toBeNull()
    fillPassword(page)
    await submit(page)
    expect(mocks.passwordRegister).toHaveBeenCalledWith('Carla', 'correct horse battery', '', '', { as: 'trainer', phone: '+55 11 9999' })
    expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ trainerStatus: 'pending' }))
    expect(page.textContent).toContain('Waiting for the owner to approve your account')
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }))
  })

  it('a name in use is said in the words the profile form uses', async () => {
    mocks.passwordRegister.mockRejectedValue(fail(409, { code: 'name-taken' }))
    const page = mount(<TrainerSignup onBack={() => {}} />)
    fillPassword(page)
    await submit(page)
    expect(page.querySelector('[role="alert"]').textContent).toBe('Another profile already signs in with this name.')
    expect(page.textContent).not.toContain('Waiting for the owner')
  })

  it('the first account on a new server is approved at once and goes straight in', async () => {
    mocks.passwordRegister.mockResolvedValue({ id: 'u1', name: 'Carla', role: 'trainer', trainerStatus: 'approved', owner: true })
    const onDone = vi.fn()
    const page = mount(<TrainerSignup onDone={onDone} onBack={() => {}} />)
    fillPassword(page)
    await submit(page)
    expect(onDone).toHaveBeenCalled()
    expect(page.textContent).not.toContain('Waiting for the owner')
  })

  it('asks for the admin invite code on an invite-only server', () => {
    mocks.config = { password_login: true, invite_only: true }
    const page = mount(<TrainerSignup onBack={() => {}} />)
    expect(byPlaceholder(page, 'Invite code')).toBeTruthy()
  })

  it('without passwords it is a passkey, with the same extra fields', async () => {
    mocks.webauthn = true
    mocks.config = {}
    mocks.passkeyRegister.mockResolvedValue({ id: 'u1', name: 'Carla', role: 'trainer', trainerStatus: 'pending' })
    const onBack = vi.fn()
    const page = mount(<TrainerSignup onBack={onBack} />)
    expect(byPlaceholder(page, 'Repeat the password')).toBeNull()
    type(byPlaceholder(page, 'Your name'), 'Carla')
    type(byPlaceholder(page, 'Phone (optional)'), '')
    act(() => button(page, 'Create passkey').click())
    await settle()
    expect(mocks.passkeyRegister).toHaveBeenCalledWith('Carla', '', { as: 'trainer', phone: '' })
    expect(page.textContent).toContain('Waiting for the owner to approve your account')
  })

  it('Back goes back', () => {
    const onBack = vi.fn()
    const page = mount(<TrainerSignup onBack={onBack} />)
    act(() => button(page, 'Back').click())
    expect(onBack).toHaveBeenCalled()
  })
})
