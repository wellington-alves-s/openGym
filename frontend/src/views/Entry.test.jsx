// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Entry from './Entry.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The first screen of a trainer-mode server, before anyone signs in: who is this, a student or
   a personal trainer. The choice only decides which sign-in comes next. */
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
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)

describe('Entry', () => {
  it('offers the two roles and says which one was picked', () => {
    const onPick = vi.fn()
    const page = mount(<Entry onPick={onPick} />)
    expect([...page.querySelectorAll('button')].map(b => b.textContent)).toEqual(["I'm a student", "I'm a personal trainer"])
    act(() => button(page, "I'm a student").click())
    expect(onPick).toHaveBeenLastCalledWith('student')
    act(() => button(page, "I'm a personal trainer").click())
    expect(onPick).toHaveBeenLastCalledWith('trainer')
  })
})
