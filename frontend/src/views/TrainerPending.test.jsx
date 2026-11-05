// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TrainerPending from './TrainerPending.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A trainer the owner has not approved yet sees only this: what is happening, and a way out. */
const mocks = vi.hoisted(() => ({ leaveServer: vi.fn(), api: vi.fn(), setUser: vi.fn(), user: null }))
vi.mock('../components/ServerSync.jsx', () => ({ leaveServer: (...a) => mocks.leaveServer(...a) }))
vi.mock('../lib/api.js', () => ({ api: (...a) => mocks.api(...a) }))
vi.mock('../store/useStore.js', () => ({
  useStore: { getState: () => ({ user: mocks.user, setUser: mocks.setUser }) },
}))

const pendingUser = { id: 't1', name: 'Carla', role: 'trainer', trainerStatus: 'pending' }
const approvedUser = { ...pendingUser, trainerStatus: 'approved' }
beforeEach(() => { mocks.api.mockReset(); mocks.setUser.mockReset(); mocks.user = pendingUser })
const mounted = []
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}

describe('TrainerPending', () => {
  it('shows the waiting message and signs out the way Settings does', () => {
    const page = mount(<TrainerPending />)
    expect(page.textContent).toContain('Waiting for the owner to approve your account')
    const buttons = [...page.querySelectorAll('button')]
    expect(buttons.map(b => b.textContent)).toEqual(['Sign out'])
    act(() => buttons[0].click())
    expect(mocks.leaveServer).toHaveBeenCalledWith('signout', expect.any(Object))
  })
})

/* The owner approves while the trainer waits: the screen asks the server again (when the window
   comes back, and every 30 seconds) and the store's user changes, which moves App to /students. */
describe('TrainerPending checks for the approval', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const later = async ms => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

  it('names the waiting message as a status', () => {
    const page = mount(<TrainerPending />)
    expect(page.querySelector('[role="status"]').textContent).toBe('Waiting for the owner to approve your account')
  })

  it('asks every 30 seconds and hands the store the approved user', async () => {
    mocks.api.mockResolvedValue({ user: pendingUser })
    mount(<TrainerPending />)
    await later(29_000)
    expect(mocks.api).not.toHaveBeenCalled()
    await later(1_000)
    expect(mocks.api).toHaveBeenCalledWith('/api/me')
    expect(mocks.setUser).not.toHaveBeenCalled()   // still pending: nothing to change
    mocks.api.mockResolvedValue({ user: approvedUser })
    await later(30_000)
    expect(mocks.setUser).toHaveBeenCalledWith(approvedUser)
  })

  it('asks again when the window regains focus or becomes visible', async () => {
    mocks.api.mockResolvedValue({ user: approvedUser })
    mount(<TrainerPending />)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(mocks.api).toHaveBeenCalledTimes(1)
    expect(mocks.setUser).toHaveBeenCalledWith(approvedUser)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(mocks.api).toHaveBeenCalledTimes(2)
  })

  it('stays quiet when the server cannot be reached', async () => {
    mocks.api.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }))
    const page = mount(<TrainerPending />)
    await later(30_000)
    expect(mocks.setUser).not.toHaveBeenCalled()
    expect(page.textContent).toContain('Waiting for the owner')
  })

  it('stops its timer and listeners on unmount', async () => {
    mocks.api.mockResolvedValue({ user: pendingUser })
    mount(<TrainerPending />)
    act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) })
    await later(60_000)
    await act(async () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    expect(mocks.api).not.toHaveBeenCalled()
  })
})
