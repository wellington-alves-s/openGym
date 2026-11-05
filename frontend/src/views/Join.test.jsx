// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Join from './Join.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A student opens the link their trainer sent. The screen asks the server what the invite is for,
   shows who will see what, and makes the account. A wrong, used or expired code is one message. */
const mocks = vi.hoisted(() => {
  const state = { webauthn: false, config: { password_login: true } }
  state.setUser = vi.fn()
  state.pullState = vi.fn(async () => {})
  state.toast = vi.fn()
  state.joinInfo = vi.fn()
  state.joinWithPassword = vi.fn()
  state.joinWithPasskey = vi.fn()
  state.snapshot = () => ({ S: {}, config: state.config, setUser: state.setUser, pullState: state.pullState, pushState: vi.fn(async () => {}) })
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
  webauthnOK: () => mocks.webauthn, bio: () => 'your fingerprint', api: vi.fn(),
  passkeyError: (e, fallback) => e?.message || fallback,
}))
vi.mock('../lib/trainer-api.js', () => ({
  joinInfo: (...a) => mocks.joinInfo(...a),
  joinWithPassword: (...a) => mocks.joinWithPassword(...a),
  joinWithPasskey: (...a) => mocks.joinWithPasskey(...a),
}))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn() }))

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
const sw = (host, label) => host.querySelector(`[role="switch"][aria-label="${label}"]`)
const submit = async host => { act(() => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }
const fillPassword = host => {
  type(byPlaceholder(host, 'Password'), 'correct horse battery')
  type(byPlaceholder(host, 'Repeat the password'), 'correct horse battery')
}
const open = async () => { const page = mount(<Join code="AAAA-BBBB-CCCC" />); await settle(); return page }

beforeEach(() => {
  mocks.webauthn = false
  mocks.config = { password_login: true }
  for (const k of ['setUser', 'pullState', 'toast', 'joinInfo', 'joinWithPassword', 'joinWithPasskey']) mocks[k].mockReset()
  mocks.pullState.mockResolvedValue()
  mocks.joinInfo.mockResolvedValue({ trainerName: 'Di', studentName: 'Bo', shares: ['workouts'] })
})
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('Join', () => {
  it('asks the server about the code, then shows the trainer and the three switches off', async () => {
    const page = await open()
    expect(mocks.joinInfo).toHaveBeenCalledWith('AAAA-BBBB-CCCC')
    expect(page.textContent).toContain('Di will see your workouts')
    for (const label of ['Body measurements', 'Progress photos', 'Diet']) expect(sw(page, label).getAttribute('aria-checked')).toBe('false')
    // Workouts are not a choice.
    expect(page.querySelectorAll('[role="switch"]').length).toBe(3)
    expect(byPlaceholder(page, 'Your name').value).toBe('Bo')
    expect(page.textContent).not.toContain('AAAA-BBBB-CCCC')
  })

  it('sends what was switched on, as booleans, with the edited name', async () => {
    mocks.joinWithPassword.mockResolvedValue({ id: 's1', name: 'Bob', role: 'student' })
    const page = await open()
    act(() => sw(page, 'Body measurements').click())
    expect(sw(page, 'Body measurements').getAttribute('aria-checked')).toBe('true')
    type(byPlaceholder(page, 'Your name'), 'Bob')
    fillPassword(page)
    await submit(page)
    expect(mocks.joinWithPassword).toHaveBeenCalledWith('AAAA-BBBB-CCCC', {
      name: 'Bob', password: 'correct horse battery', consent: { measures: true, photos: false, diet: false } })
    expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
  })

  it('a wrong, used or expired code is one message and no form', async () => {
    mocks.joinInfo.mockRejectedValue(fail(404, { error: 'not found' }))
    const page = await open()
    expect(page.textContent).toContain('This invite is no longer valid. Ask your trainer for a new one.')
    expect(page.querySelector('form')).toBeNull()
    expect(page.querySelector('input')).toBeNull()
    expect(page.querySelector('button')).toBeNull()   // no retry: the invite is dead
  })

  it.each([['no status', new Error('Failed to fetch')], ['a 503', fail(503, { error: 'busy' })]])(
    'a load that failed with %s is not an invalid invite: it can be tried again', async (_, error) => {
      mocks.joinInfo.mockRejectedValueOnce(error)
      const page = await open()
      expect(page.textContent).toContain('Could not reach the server. Check your connection and try again.')
      expect(page.textContent).not.toContain('no longer valid')
      expect(page.querySelector('form')).toBeNull()
      act(() => [...page.querySelectorAll('button')].find(b => b.textContent === 'Try again').click())
      await settle()
      expect(mocks.joinInfo).toHaveBeenCalledTimes(2)
      expect(mocks.joinInfo).toHaveBeenLastCalledWith('AAAA-BBBB-CCCC')
      expect(page.textContent).toContain('Di will see your workouts')
      expect(page.querySelector('form')).toBeTruthy()
    })

  it('an answer that is not an invite is a failed load too', async () => {
    mocks.joinInfo.mockResolvedValueOnce({})
    const page = await open()
    expect(page.textContent).toContain('Could not reach the server')
  })

  it('a code spent between loading and submitting replaces the form with the invalid card', async () => {
    mocks.joinWithPassword.mockRejectedValue(fail(404, { error: 'not found' }))
    const page = await open()
    fillPassword(page)
    await submit(page)
    expect(page.textContent).toContain('This invite is no longer valid. Ask your trainer for a new one.')
    expect(page.querySelector('form')).toBeNull()
    expect(page.textContent).not.toContain('not found')
  })

  it('the same at the passkey step', async () => {
    mocks.webauthn = true
    mocks.config = {}
    mocks.joinWithPasskey.mockRejectedValue(fail(404, { error: 'not found' }))
    const page = await open()
    await submit(page)
    expect(page.textContent).toContain('This invite is no longer valid')
    expect(page.querySelector('form')).toBeNull()
  })

  it('a name in use is said, and the form stays with the name editable', async () => {
    mocks.joinWithPassword.mockRejectedValue(fail(409, { code: 'name-taken' }))
    const page = await open()
    fillPassword(page)
    await submit(page)
    expect(page.querySelector('[role="alert"]').textContent).toBe('That name is already taken. Pick another one.')
    const name = byPlaceholder(page, 'Your name')
    expect(name.disabled).toBe(false)
    expect(mocks.setUser).not.toHaveBeenCalled()
    mocks.joinWithPassword.mockResolvedValue({ id: 's1' })
    type(name, 'Bo 2')
    await submit(page)
    expect(mocks.joinWithPassword.mock.calls[1][1].name).toBe('Bo 2')
  })

  it('too many attempts uses the sign-in wording', async () => {
    mocks.joinWithPassword.mockRejectedValue(fail(429, { code: 'locked', retryAfter: 120 }))
    const page = await open()
    fillPassword(page)
    await submit(page)
    expect(page.querySelector('[role="alert"]').textContent).toMatch(/^Too many attempts/)
  })

  it('checks the password here before asking the server', async () => {
    const page = await open()
    type(byPlaceholder(page, 'Password'), 'short')
    type(byPlaceholder(page, 'Repeat the password'), 'short')
    await submit(page)
    expect(page.querySelector('[role="alert"]')).toBeTruthy()
    expect(mocks.joinWithPassword).not.toHaveBeenCalled()
  })

  it('with a passkey it sends the name and consent through the passkey path', async () => {
    mocks.webauthn = true
    mocks.config = {}
    mocks.joinWithPasskey.mockResolvedValue({ id: 's1', name: 'Bo', role: 'student' })
    const page = await open()
    expect(byPlaceholder(page, 'Password')).toBeNull()
    act(() => sw(page, 'Diet').click())
    await submit(page)
    expect(mocks.joinWithPasskey).toHaveBeenCalledWith('AAAA-BBBB-CCCC', { name: 'Bo', consent: { measures: false, photos: false, diet: true } })
    expect(mocks.setUser).toHaveBeenCalled()
  })

  it('a closed passkey prompt is no error', async () => {
    mocks.webauthn = true
    mocks.config = {}
    mocks.joinWithPasskey.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    const page = await open()
    await submit(page)
    expect(page.querySelector('[role="alert"]')).toBeNull()
  })

  it('takes the join parameter off the address once it is in', async () => {
    window.history.replaceState({}, '', '/?join=AAAA-BBBB-CCCC')
    mocks.joinWithPassword.mockResolvedValue({ id: 's1' })
    const page = await open()
    fillPassword(page)
    await submit(page)
    expect(window.location.search).toBe('')
  })
})
