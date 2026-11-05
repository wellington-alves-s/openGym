// @vitest-environment happy-dom
// The multi-choice filter sheet: tick rows, Clear unticks all, Apply hands the ticked values back
// and closes; nothing is reported before Apply.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilterSheet from './FilterSheet.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted = []
function render(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<FilterSheet title="Equipment" options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma' }]} {...props} />))
  return host
}
const btn = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const ticked = host => [...host.querySelectorAll('.lrow[aria-pressed="true"]')].map(b => b.textContent.trim())
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('FilterSheet', () => {
  it('opens with the given values ticked and reports nothing until Apply', () => {
    const onApply = vi.fn(), close = vi.fn()
    const host = render({ values: ['b'], onApply, close })
    expect(ticked(host)).toEqual(['Beta'])
    act(() => btn(host, 'Alpha').click())
    expect(ticked(host)).toEqual(['Alpha', 'Beta'])
    expect(onApply).not.toHaveBeenCalled()
    act(() => btn(host, 'Apply').click())
    expect(onApply).toHaveBeenCalledWith(['b', 'a'])
    expect(close).toHaveBeenCalled()
  })

  it('Clear unticks everything; Apply then hands back an empty list', () => {
    const onApply = vi.fn()
    const host = render({ values: ['a', 'c'], onApply, close: vi.fn() })
    act(() => btn(host, 'Clear').click())
    expect(ticked(host)).toEqual([])
    act(() => btn(host, 'Apply').click())
    expect(onApply).toHaveBeenCalledWith([])
  })

  it('unticks a row tapped twice', () => {
    const host = render({ values: [], onApply: vi.fn(), close: vi.fn() })
    act(() => btn(host, 'Gamma').click())
    act(() => btn(host, 'Gamma').click())
    expect(ticked(host)).toEqual([])
  })
})
