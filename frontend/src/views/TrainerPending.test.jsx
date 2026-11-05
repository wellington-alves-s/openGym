// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TrainerPending from './TrainerPending.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A trainer the owner has not approved yet sees only this: what is happening, and a way out. */
const mocks = vi.hoisted(() => ({ leaveServer: vi.fn() }))
vi.mock('../components/ServerSync.jsx', () => ({ leaveServer: (...a) => mocks.leaveServer(...a) }))

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
