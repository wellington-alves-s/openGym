// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PublishSheet from './PublishSheet.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Publishing a student's draft: an optional note, the latest revision (asked for only once any
   pending save is in), and a plain notice when the draft has no exercise yet. */
const mocks = vi.hoisted(() => ({ publishRx: vi.fn(), toast: vi.fn() }))
vi.mock('../lib/trainer-api.js', () => ({ publishRx: (...a) => mocks.publishRx(...a) }))
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})

let host, root
function mount(el) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(el))
}
const press = text => act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === text).click())
const type = (el, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

beforeEach(() => { mocks.publishRx.mockReset(); mocks.toast.mockReset() })
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('PublishSheet', () => {
  it('publishes with the note and the latest revision, then closes', async () => {
    mocks.publishRx.mockResolvedValue({ rx: { _rev: 8 }, v: 3 })
    const close = vi.fn(), onDone = vi.fn()
    const latestRev = vi.fn(async () => 7)
    mount(<PublishSheet sid="abc" empty={false} latestRev={latestRev} onDone={onDone} close={close} />)
    type(host.querySelector('textarea'), 'Heavier squats')
    await press('Publish')
    expect(latestRev).toHaveBeenCalled()
    expect(mocks.publishRx).toHaveBeenCalledWith('abc', 'Heavier squats', 7)
    expect(close).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('an empty draft says to add an exercise first and publishes nothing', async () => {
    const close = vi.fn()
    mount(<PublishSheet sid="abc" empty latestRev={async () => 1} close={close} />)
    await press('Publish')
    expect(host.textContent).toContain('Add at least one exercise first')
    expect(mocks.publishRx).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it('a double tap publishes once', async () => {
    let release
    mocks.publishRx.mockReturnValue(new Promise(r => { release = r }))
    mount(<PublishSheet sid="abc" empty={false} latestRev={async () => 1} close={vi.fn()} />)
    await press('Publish'); await press('Publish')
    await act(async () => { release({ rx: { _rev: 2 }, v: 1 }) })
    expect(mocks.publishRx).toHaveBeenCalledTimes(1)
  })

  it('a 409 says the plan changed, and the screen behind reloads', async () => {
    mocks.publishRx.mockRejectedValue(Object.assign(new Error('x'), { status: 409, data: { code: 'conflict' } }))
    const close = vi.fn(), onDone = vi.fn()
    mount(<PublishSheet sid="abc" empty={false} latestRev={async () => 1} onDone={onDone} close={close} />)
    await press('Publish')
    expect(host.textContent).toContain('The plan changed somewhere else')
    expect(close).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })
})
