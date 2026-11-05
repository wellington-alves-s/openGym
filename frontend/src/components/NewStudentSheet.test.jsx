// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NewStudentSheet, { InviteLinkSheet } from './NewStudentSheet.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The trainer adds a student: name (required), phone and e-mail (optional). The invite link is
   shown here, in this sheet, and nowhere else. */
const mocks = vi.hoisted(() => ({ createStudent: vi.fn(), toast: vi.fn(), copyText: vi.fn() }))
vi.mock('../lib/trainer-api.js', () => ({ createStudent: (...a) => mocks.createStudent(...a) }))
vi.mock('../lib/clipboard.js', () => ({ copyText: (...a) => mocks.copyText(...a) }))
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})

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
const field = (host, label) => host.querySelector(`input[aria-label="${label}"]`)
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const submit = async host => { act(() => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }

beforeEach(() => {
  mocks.createStudent.mockReset(); mocks.toast.mockReset(); mocks.copyText.mockReset()
  window.open = vi.fn()
})
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('NewStudentSheet', () => {
  it('creates the student and then shows the invite link', async () => {
    mocks.createStudent.mockResolvedValue({ student: { id: 's1' }, code: 'ABCD-EFGH-JKLM' })
    const onCreated = vi.fn()
    const host = mount(<NewStudentSheet onCreated={onCreated} />)
    type(field(host, 'Student name'), '  Ana ')
    type(field(host, 'Phone (optional)'), '+55 11 9999')
    type(field(host, 'E-mail (optional)'), 'ana@example.com')
    await submit(host)
    expect(mocks.createStudent).toHaveBeenCalledWith({ name: 'Ana', phone: '+55 11 9999', email: 'ana@example.com' })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain(`${window.location.origin}${window.location.pathname}?join=ABCD-EFGH-JKLM`)
    expect(host.querySelector('form')).toBeNull()
    expect(button(host, 'Copy link')).toBeTruthy()
    expect(button(host, 'Send on WhatsApp')).toBeTruthy()
  })

  it('needs a name and does not ask the server without one', async () => {
    const host = mount(<NewStudentSheet />)
    await submit(host)
    expect(mocks.createStudent).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]').textContent).toBe('Enter a name')
  })

  it('shows what the server said, and keeps the form', async () => {
    mocks.createStudent.mockRejectedValue(Object.assign(new Error('x'), { status: 400, data: { error: 'name must be 1 to 40 characters', code: 'bad-name' } }))
    const host = mount(<NewStudentSheet />)
    type(field(host, 'Student name'), 'Ana')
    await submit(host)
    expect(host.querySelector('[role="alert"]').textContent).toBe('name must be 1 to 40 characters')
    expect(host.querySelector('form')).not.toBeNull()
  })

  it('never logs the code', async () => {
    const spy = vi.spyOn(console, 'log')
    mocks.createStudent.mockResolvedValue({ student: { id: 's1' }, code: 'ABCD-EFGH-JKLM' })
    const host = mount(<NewStudentSheet />)
    type(field(host, 'Student name'), 'Ana')
    await submit(host)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('a second submit while the first is in flight sends nothing, and the button keeps focus', async () => {
    let release
    mocks.createStudent.mockImplementation(() => new Promise(r => { release = () => r({ student: { id: 's1' }, code: 'ABCD-EFGH-JKLM' }) }))
    const host = mount(<NewStudentSheet />)
    type(field(host, 'Student name'), 'Ana')
    const send = () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    act(() => { send(); send() })
    expect(button(host, 'Create invite').disabled).toBe(false)
    expect(button(host, 'Create invite').getAttribute('aria-disabled')).toBe('true')
    act(() => { send() })
    expect(mocks.createStudent).toHaveBeenCalledTimes(1)
    await act(async () => { release() })
    await settle()
  })
})

describe('InviteLinkSheet', () => {
  const LINK = 'https://gym.example/?join=ABCD-EFGH-JKLM'
  it('copies the link and says so', async () => {
    mocks.copyText.mockResolvedValue(true)
    const host = mount(<InviteLinkSheet link={LINK} />)
    act(() => button(host, 'Copy link').click())
    await settle()
    expect(mocks.copyText).toHaveBeenCalledWith(LINK)
    expect(mocks.toast).toHaveBeenCalledWith('Link copied')
  })

  it('opens WhatsApp with a message that holds the link', () => {
    const host = mount(<InviteLinkSheet link={LINK} />)
    act(() => button(host, 'Send on WhatsApp').click())
    const url = window.open.mock.calls[0][0]
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toContain(LINK)
  })
})
