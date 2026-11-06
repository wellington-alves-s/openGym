// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VersionsSheet from './VersionsSheet.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The versions of a student's plan, newest first, and putting one back into the draft. */
const mocks = vi.hoisted(() => ({ restoreRx: vi.fn(), toast: vi.fn(), confirmSheet: vi.fn() }))
vi.mock('../lib/trainer-api.js', () => ({ restoreRx: (...a) => mocks.restoreRx(...a) }))
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirmSheet(...a) }))

const T = Date.UTC(2026, 9, 5, 12)
const versions = [{ v: 1, at: T, note: 'Start' }, { v: 2, at: T + 864e5, note: '' }, { v: 3, at: T + 2 * 864e5, note: 'Deload' }]
let host, root
function mount(el) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(el))
}
const rows = () => [...host.querySelectorAll('li')]

beforeEach(() => { mocks.restoreRx.mockReset(); mocks.toast.mockReset(); mocks.confirmSheet.mockReset() })
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('VersionsSheet', () => {
  it('lists the versions newest first with number, date and note', () => {
    mount(<VersionsSheet sid="abc" versions={versions} latestRev={async () => 4} close={() => {}} />)
    expect(rows().map(li => li.querySelector('strong').textContent)).toEqual(['Version 3', 'Version 2', 'Version 1'])
    expect(rows()[0].textContent).toContain('Deload')
    expect(rows()[2].textContent).toContain('Start')
    expect(rows()[2].textContent).toContain('Oct')
  })

  it('"Restore to draft" asks first, then restores with the latest revision and reloads', async () => {
    mocks.restoreRx.mockResolvedValue({ rx: { _rev: 5 } })
    const close = vi.fn(), onDone = vi.fn()
    mount(<VersionsSheet sid="abc" versions={versions} latestRev={async () => 4} onDone={onDone} close={close} />)
    act(() => rows()[1].querySelector('button').click())
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(mocks.restoreRx).not.toHaveBeenCalled()
    await act(async () => { await mocks.confirmSheet.mock.calls[0][0].onConfirm() })
    expect(mocks.restoreRx).toHaveBeenCalledWith('abc', 2, 4)
    expect(close).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('says when nothing was published yet', () => {
    mount(<VersionsSheet sid="abc" versions={[]} latestRev={async () => 0} close={() => {}} />)
    expect(host.textContent).toContain('Nothing published yet')
    expect(rows()).toEqual([])
  })
})
