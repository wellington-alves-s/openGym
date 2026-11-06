// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Students from './Students.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The trainer's list: who was invited, who is linked, who left; and only the actions that fit
   each state. The invite link itself is shown by a sheet (components/NewStudentSheet.jsx). */
const mocks = vi.hoisted(() => ({
  listStudents: vi.fn(), newInvite: vi.fn(), removeStudent: vi.fn(), unlinkStudent: vi.fn(),
  toast: vi.fn(), openSheet: vi.fn(), confirmSheet: vi.fn(),
}))
vi.mock('../../lib/trainer-api.js', () => ({
  listStudents: (...a) => mocks.listStudents(...a), newInvite: (...a) => mocks.newInvite(...a),
  removeStudent: (...a) => mocks.removeStudent(...a), unlinkStudent: (...a) => mocks.unlinkStudent(...a),
}))
vi.mock('../../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: (...a) => mocks.openSheet(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirmSheet(...a) }))

const T = Date.UTC(2026, 9, 5, 12)
const ana = { id: 'a1', name: 'Ana', status: 'invited', phone: null, created: T, linkedAt: null }
const bia = { id: 'b2', name: 'Bia', status: 'active', phone: '+55 11 9999', created: T, linkedAt: T }
const caio = { id: 'c3', name: 'Caio', status: 'unlinked', phone: null, created: T, linkedAt: T }

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(<MemoryRouter initialEntries={['/students']}>
    <Routes>
      <Route path="/students" element={el} />
      <Route path="/students/:sid" element={<p>student page</p>} />
    </Routes>
  </MemoryRouter>))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const names = host => [...host.querySelectorAll('li')].map(li => li.querySelector('strong').textContent)
const row = (host, name) => [...host.querySelectorAll('li')].find(li => li.querySelector('strong').textContent === name)
const actions = li => [...li.querySelectorAll('button')].map(b => b.textContent)
const press = (li, text) => act(() => [...li.querySelectorAll('button')].find(b => b.textContent === text).click())

beforeEach(() => {
  for (const k of ['listStudents', 'newInvite', 'removeStudent', 'unlinkStudent', 'toast', 'openSheet', 'confirmSheet']) mocks[k].mockReset()
  mocks.removeStudent.mockResolvedValue({ ok: true })
  mocks.unlinkStudent.mockResolvedValue({ ok: true })
  mocks.confirmSheet.mockImplementation(() => {})
})
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('Students', () => {
  it('invites the trainer to add the first student when there are none', async () => {
    mocks.listStudents.mockResolvedValue([])
    const host = mount(<Students />)
    await settle()
    expect(host.textContent).toContain('No students yet. Add your first student to send them an invite link.')
    expect(host.querySelector('li')).toBeNull()
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'New student').click())
    expect(mocks.openSheet).toHaveBeenCalledTimes(1)
  })

  it('lists each student with a state label and only the actions that state allows', async () => {
    mocks.listStudents.mockResolvedValue([ana, bia, caio])
    const host = mount(<Students />)
    await settle()
    expect(names(host)).toEqual(['Ana', 'Bia', 'Caio'])
    expect(row(host, 'Ana').textContent).toContain('Invite pending')
    expect(row(host, 'Bia').textContent).toContain('Active')
    expect(row(host, 'Caio').textContent).toContain('Unlinked')
    expect(row(host, 'Ana').textContent).toContain('Oct')   // the date, in the app's own format
    expect(actions(row(host, 'Ana'))).toEqual(['New link', 'Remove invite'])
    expect(actions(row(host, 'Bia'))).toEqual(['Unlink'])
    expect(actions(row(host, 'Caio'))).toEqual([])
  })

  it('"New link" asks for a fresh invite and opens it in a sheet, then reloads', async () => {
    mocks.listStudents.mockResolvedValue([ana])
    mocks.newInvite.mockResolvedValue('ABCD-EFGH-JKLM')
    const host = mount(<Students />)
    await settle()
    press(row(host, 'Ana'), 'New link')
    await settle()
    expect(mocks.newInvite).toHaveBeenCalledWith('a1')
    expect(mocks.openSheet).toHaveBeenCalledTimes(1)
    expect(mocks.listStudents).toHaveBeenCalledTimes(2)
  })

  it('"Remove invite" asks first, and removes only once confirmed', async () => {
    mocks.listStudents.mockResolvedValue([ana])
    const host = mount(<Students />)
    await settle()
    press(row(host, 'Ana'), 'Remove invite')
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(mocks.removeStudent).not.toHaveBeenCalled()
    mocks.listStudents.mockResolvedValue([])
    await act(async () => { await mocks.confirmSheet.mock.calls[0][0].onConfirm() })
    expect(mocks.removeStudent).toHaveBeenCalledWith('a1')
    await settle()
    expect(mocks.listStudents).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('No students yet.')
  })

  it('"Unlink" asks first, and unlinks only once confirmed', async () => {
    mocks.listStudents.mockResolvedValue([bia])
    const host = mount(<Students />)
    await settle()
    press(row(host, 'Bia'), 'Unlink')
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(mocks.unlinkStudent).not.toHaveBeenCalled()
    await act(async () => { await mocks.confirmSheet.mock.calls[0][0].onConfirm() })
    expect(mocks.unlinkStudent).toHaveBeenCalledWith('b2')
    await settle()
    expect(mocks.listStudents).toHaveBeenCalledTimes(2)
  })

  it('a linked student row opens their page; the others do not open anything', async () => {
    mocks.listStudents.mockResolvedValue([ana, bia, caio])
    const host = mount(<Students />)
    await settle()
    expect(row(host, 'Ana').querySelector('[role="button"]')).toBeNull()
    expect(row(host, 'Caio').querySelector('[role="button"]')).toBeNull()
    act(() => row(host, 'Bia').querySelector('[role="button"]').click())
    expect(host.textContent).toContain('student page')
  })

  it('says what the server said when an action fails', async () => {
    mocks.listStudents.mockResolvedValue([bia])
    mocks.unlinkStudent.mockRejectedValue(Object.assign(new Error('x'), { status: 404, data: { error: 'no such student', code: 'not-found' } }))
    const host = mount(<Students />)
    await settle()
    press(row(host, 'Bia'), 'Unlink')
    await act(async () => { await mocks.confirmSheet.mock.calls[0][0].onConfirm() })
    expect(mocks.toast).toHaveBeenCalledWith('no such student')
  })

  it('says when the list could not be loaded, and tries again on request', async () => {
    mocks.listStudents.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
    mocks.listStudents.mockResolvedValue([ana])
    const host = mount(<Students />)
    await settle()
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Try again').click())
    await settle()
    expect(names(host)).toEqual(['Ana'])
  })
})

describe('Students, a double tap', () => {
  it('"New link" runs once while the call is in flight and the button says it is busy', async () => {
    mocks.listStudents.mockResolvedValue([ana])
    let release
    mocks.newInvite.mockImplementation(() => new Promise(r => { release = r }))
    const host = mount(<Students />)
    await settle()
    const li = row(host, 'Ana')
    const btn = () => [...li.querySelectorAll('button')].find(b => b.textContent === 'New link')
    act(() => { btn().click() })
    // Not `disabled`: the button keeps keyboard focus, and the tap itself is what is ignored.
    expect(btn().disabled).toBe(false)
    expect(btn().getAttribute('aria-disabled')).toBe('true')
    act(() => { btn().click() })
    expect(mocks.newInvite).toHaveBeenCalledTimes(1)
    await act(async () => { release('ABCD-EFGH-JKLM') })
    await settle()
    expect(mocks.openSheet).toHaveBeenCalledTimes(1)
    expect(btn().getAttribute('aria-disabled')).toBe('false')
  })
})
