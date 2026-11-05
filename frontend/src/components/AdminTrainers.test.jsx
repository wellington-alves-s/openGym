// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminTrainers from './AdminTrainers.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The owner's card for trainer accounts: pending ones to approve or reject, approved ones with their
   student count, and the owner's own trainer switch. An admin who is not the owner only reads. */
const mocks = vi.hoisted(() => ({
  listTrainers: vi.fn(), approveTrainer: vi.fn(), rejectTrainer: vi.fn(), setTrainerMode: vi.fn(),
  api: vi.fn(), setUser: vi.fn(), toast: vi.fn(), confirmSheet: vi.fn(),
}))
vi.mock('../lib/trainer-api.js', () => ({
  listTrainers: (...a) => mocks.listTrainers(...a), approveTrainer: (...a) => mocks.approveTrainer(...a),
  rejectTrainer: (...a) => mocks.rejectTrainer(...a), setTrainerMode: (...a) => mocks.setTrainerMode(...a),
}))
vi.mock('../lib/api.js', () => ({ api: (...a) => mocks.api(...a) }))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ setUser: (...a) => mocks.setUser(...a) })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirmSheet(...a) }))

const T = Date.UTC(2026, 9, 5, 12)
const rita = { id: 'p1', name: 'Rita', status: 'pending', created: T, students: 0 }
const beto = { id: 'p2', name: 'Beto', status: 'pending', created: T, students: 0 }
const dora = { id: 'a1', name: 'Dora', status: 'approved', created: T, students: 3 }
const ownerTrainer = { id: 'own', name: 'Dono', status: 'approved', created: T, students: 1 }

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
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const labelled = (host, label) => host.querySelector(`[aria-label="${label}"]`)
const press = el => act(() => el.click())

beforeEach(() => {
  for (const k of Object.keys(mocks)) mocks[k].mockReset()
  mocks.approveTrainer.mockResolvedValue({ ok: true })
  mocks.rejectTrainer.mockResolvedValue({ ok: true })
  mocks.setTrainerMode.mockResolvedValue({ ok: true, id: 'own', role: 'trainer' })
  mocks.api.mockResolvedValue({ user: { id: 'own', role: 'trainer' } })
  mocks.confirmSheet.mockImplementation(() => {})
})
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('AdminTrainers', () => {
  it('lists pending trainers with their date, and approved ones with the student count', async () => {
    mocks.listTrainers.mockResolvedValue([rita, dora])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    expect(host.textContent).toContain('Personal trainers')
    expect(host.textContent).toContain('Rita')
    expect(host.textContent).toContain('Oct')
    expect(host.textContent).toContain('Dora')
    expect(host.textContent).toContain('3 students')
  })

  it('says "1 student" for one and shows the empty state with no trainers', async () => {
    mocks.listTrainers.mockResolvedValue([ownerTrainer])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    expect(host.textContent).toContain('1 student')
    expect(host.textContent).not.toContain('1 students')
    mocks.listTrainers.mockResolvedValue([])
    const empty = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    expect(empty.textContent).toContain('No trainer accounts yet.')
  })

  it('Approve calls approveTrainer with the id and reloads the list', async () => {
    mocks.listTrainers.mockResolvedValueOnce([rita]).mockResolvedValueOnce([{ ...rita, status: 'approved' }])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    press(labelled(host, 'Approve Rita'))
    await settle()
    expect(mocks.approveTrainer).toHaveBeenCalledWith('p1')
    expect(mocks.listTrainers).toHaveBeenCalledTimes(2)
    expect(button(host, 'Approve')).toBeUndefined()
  })

  it('Reject asks first, saying the account is deleted, and only then calls rejectTrainer', async () => {
    mocks.listTrainers.mockResolvedValue([rita])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    press(labelled(host, 'Reject Rita'))
    expect(mocks.rejectTrainer).not.toHaveBeenCalled()
    const opts = mocks.confirmSheet.mock.calls[0][0]
    expect(opts.message).toMatch(/deleted/)
    expect(opts.danger).toBe(true)
    await act(async () => { await opts.onConfirm() })
    expect(mocks.rejectTrainer).toHaveBeenCalledWith('p1')
    expect(mocks.listTrainers).toHaveBeenCalledTimes(2)
  })

  it('Reject cancelled in the confirm makes no rejectTrainer call', async () => {
    mocks.listTrainers.mockResolvedValue([rita])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    press(labelled(host, 'Reject Rita'))
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)   // the sheet is dismissed: onConfirm never runs
    await settle()
    expect(mocks.rejectTrainer).not.toHaveBeenCalled()
    expect(mocks.listTrainers).toHaveBeenCalledTimes(1)
  })

  it('the switch follows the server answer when the list reload fails, and the next tap turns it off', async () => {
    mocks.listTrainers.mockResolvedValueOnce([dora]).mockRejectedValue(new Error('down'))
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    press(labelled(host, 'Trainer mode on my account'))
    await settle()
    expect(mocks.setTrainerMode).toHaveBeenCalledWith('own', true)
    const sw = labelled(host, 'Trainer mode on my account')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    press(sw)
    const opts = mocks.confirmSheet.mock.calls[0][0]
    await act(async () => { await opts.onConfirm() })
    expect(mocks.setTrainerMode).toHaveBeenLastCalledWith('own', false)
    expect(labelled(host, 'Trainer mode on my account').getAttribute('aria-checked')).toBe('false')
  })

  it('a failed /api/me refresh after the switch changes does not crash and still reloads the list', async () => {
    mocks.listTrainers.mockResolvedValueOnce([dora]).mockResolvedValueOnce([dora, ownerTrainer])
    mocks.api.mockRejectedValue(new Error('offline'))
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    press(labelled(host, 'Trainer mode on my account'))
    await settle()
    expect(mocks.setUser).not.toHaveBeenCalled()
    expect(mocks.listTrainers).toHaveBeenCalledTimes(2)
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(labelled(host, 'Trainer mode on my account').getAttribute('aria-checked')).toBe('true')
  })

  it('a second tap on Approve while the first is in flight does not send a second request', async () => {
    mocks.listTrainers.mockResolvedValue([rita])
    let release
    mocks.approveTrainer.mockImplementation(() => new Promise(r => { release = () => r({ ok: true }) }))
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    press(labelled(host, 'Approve Rita'))
    // Busy, the controls say so but keep focus: the tap itself is what is ignored.
    for (const l of ['Approve Rita', 'Reject Rita', 'Trainer mode on my account']) {
      expect(labelled(host, l).disabled, l).toBe(false)
      expect(labelled(host, l).getAttribute('aria-disabled'), l).toBe('true')
    }
    press(labelled(host, 'Approve Rita'))
    press(labelled(host, 'Reject Rita'))
    press(labelled(host, 'Trainer mode on my account'))
    expect(mocks.approveTrainer).toHaveBeenCalledTimes(1)
    expect(mocks.confirmSheet).not.toHaveBeenCalled()
    expect(mocks.setTrainerMode).not.toHaveBeenCalled()
    await act(async () => { release() })
    await settle()
  })

  it('shows the server message when an action fails, and still reloads', async () => {
    mocks.listTrainers.mockResolvedValue([rita])
    mocks.approveTrainer.mockRejectedValue(Object.assign(new Error('x'), { data: { error: 'Not a pending trainer' } }))
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    press(labelled(host, 'Approve Rita'))
    await settle()
    expect(mocks.toast).toHaveBeenCalledWith('Not a pending trainer')
    expect(mocks.listTrainers).toHaveBeenCalledTimes(2)
  })

  it('the owner switch is off when the owner is not among the approved trainers, and turning it on calls setTrainerMode', async () => {
    mocks.listTrainers.mockResolvedValue([dora])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    const sw = labelled(host, 'Trainer mode on my account')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    press(sw)
    await settle()
    expect(mocks.confirmSheet).not.toHaveBeenCalled()
    expect(mocks.setTrainerMode).toHaveBeenCalledWith('own', true)
    // reloads the list and refreshes the signed-in user so the tabs follow
    expect(mocks.listTrainers).toHaveBeenCalledTimes(2)
    expect(mocks.api).toHaveBeenCalledWith('/api/me')
    expect(mocks.setUser).toHaveBeenCalledWith({ id: 'own', role: 'trainer' })
  })

  it('the owner switch is on when the owner is an approved trainer, and turning it off confirms first (students are unlinked)', async () => {
    mocks.listTrainers.mockResolvedValue([ownerTrainer])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    const sw = labelled(host, 'Trainer mode on my account')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    press(sw)
    expect(mocks.setTrainerMode).not.toHaveBeenCalled()
    const opts = mocks.confirmSheet.mock.calls[0][0]
    expect(opts.message).toMatch(/unlinked/)
    await act(async () => { await opts.onConfirm() })
    expect(mocks.setTrainerMode).toHaveBeenCalledWith('own', false)
    expect(mocks.setUser).toHaveBeenCalled()
  })

  it('an admin who is not the owner sees both lists without any action or switch', async () => {
    mocks.listTrainers.mockResolvedValue([rita, dora])
    const host = mount(<AdminTrainers owner={false} ownId="adm" />)
    await settle()
    expect(host.textContent).toContain('Rita')
    expect(host.textContent).toContain('Dora')
    expect(host.querySelectorAll('button')).toHaveLength(0)
    expect(host.querySelector('[role="switch"]')).toBeNull()
  })

  it('a failed load says so and "Try again" loads the list', async () => {
    mocks.listTrainers.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([dora])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    expect(host.textContent).toContain('Could not load trainers.')
    press(button(host, 'Try again'))
    await settle()
    expect(host.textContent).not.toContain('Could not load trainers.')
    expect(host.textContent).toContain('Dora')
  })

  it('shows nothing about a trainer beyond name, date and students', async () => {
    mocks.listTrainers.mockResolvedValue([{ ...beto, phone: '+55 11 9999', email: 'b@x.y' }])
    const host = mount(<AdminTrainers owner ownId="own" />)
    await settle()
    expect(host.textContent).not.toContain('9999')
    expect(host.textContent).not.toContain('b@x.y')
  })
})
