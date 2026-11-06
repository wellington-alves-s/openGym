// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyTrainer from './MyTrainer.jsx'
import { writeCache } from '../lib/prescription-cache.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* A student's page for their trainer: who it is, what else they share (three switches that save at
   once), and leaving. Workouts are always shared, so they are not a switch. */
const mocks = vi.hoisted(() => ({
  myTrainer: vi.fn(), setConsent: vi.fn(), leaveTrainer: vi.fn(), api: vi.fn(),
  toast: vi.fn(), confirmSheet: vi.fn(), nav: vi.fn(), setUser: vi.fn(),
}))
vi.mock('../lib/trainer-api.js', () => ({
  myTrainer: (...a) => mocks.myTrainer(...a), setConsent: (...a) => mocks.setConsent(...a), leaveTrainer: (...a) => mocks.leaveTrainer(...a),
}))
vi.mock('../lib/api.js', () => ({ api: (...a) => mocks.api(...a) }))
const store = vi.hoisted(() => ({ S: undefined, user: undefined }))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ setUser: mocks.setUser, S: store.S, user: store.user })
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
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))

const SINCE = new Date(2026, 9, 5, 12).getTime()
const answer = (consent = {}) => ({ trainer: { name: 'Rui' }, since: SINCE, consent: { measures: true, photos: false, diet: false, at: null, ...consent } })
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
const sw = (host, label) => host.querySelector(`[role="switch"][aria-label="${label}"]`)
const tap = el => act(() => el.click())
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
const open = async () => { const host = mount(<MyTrainer />); await settle(); return host }

beforeEach(() => {
  store.S = undefined; store.user = undefined
  for (const k of Object.keys(mocks)) mocks[k].mockReset()
  mocks.myTrainer.mockResolvedValue(answer())
  mocks.setConsent.mockImplementation(async c => ({ consent: c }))
  mocks.leaveTrainer.mockResolvedValue({ ok: true })
  mocks.api.mockResolvedValue({ user: { id: 'u1', name: 'Ana', role: 'student' } })
})
afterEach(() => { localStorage.clear(); act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('MyTrainer', () => {
  it('names the applied plan version only once a prescription is applied', async () => {
    let host = await open()
    expect(host.textContent).not.toContain('Training plan')
    store.S = { routines: [{ id: 'rx-a', rx: { v: 2 } }, { id: 'rx-b', rx: { v: 4 } }, { id: 'own' }] }
    host = await open()
    expect(host.textContent).toContain('Training plan: version 4')
  })

  it('adds the current month of the program to the plan line', async () => {
    const week = {}
    const phases = [{ id: 'p1', name: '', weeks: 4, bundle: { week, routines: [] } }, { id: 'p2', name: '', weeks: 4, bundle: { week, routines: [] } }]
    store.S = { routines: [{ id: 'rx-a', rx: { v: 2, p: 'p2' } }] }
    store.user = { id: 'u1' }
    let host = await open()
    expect(host.textContent).not.toContain('Month')   // no cache for this account yet
    const d = new Date(); d.setDate(d.getDate() - 30)
    const start = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    writeCache('u1', { v: 2, program: { start, phases } })
    host = await open()
    expect(host.textContent).toContain('Training plan: version 2')
    expect(host.textContent).toContain('Month 2 of 2')
    store.user = { id: 'u2' }
    host = await open()
    expect(host.textContent).not.toContain('Month 2 of 2')
  })

  it('shows the trainer, since when, and the switches as the server has them', async () => {
    const host = await open()
    expect(host.textContent).toContain('Rui')
    expect(host.textContent).toContain('2026')
    expect(host.textContent).toContain('Rui sees your workouts. You choose what else to share.')
    expect(sw(host, 'Body measurements').getAttribute('aria-checked')).toBe('true')
    expect(sw(host, 'Progress photos').getAttribute('aria-checked')).toBe('false')
    expect(sw(host, 'Diet').getAttribute('aria-checked')).toBe('false')
  })

  it('shows workouts as always on, not as a switch', async () => {
    const host = await open()
    expect(host.textContent).toContain('Workouts')
    expect(host.textContent).toContain('Always on')
    expect(host.querySelectorAll('[role="switch"]').length).toBe(3)
  })

  it('saves all three values when one switch is flipped, and shows the change at once', async () => {
    let release
    mocks.setConsent.mockImplementation(c => new Promise(r => { release = () => r({ consent: c }) }))
    const host = await open()
    tap(sw(host, 'Progress photos'))
    expect(mocks.setConsent).toHaveBeenCalledWith({ measures: true, photos: true, diet: false })
    expect(sw(host, 'Progress photos').getAttribute('aria-checked')).toBe('true')
    await act(async () => { release() })
    expect(sw(host, 'Progress photos').getAttribute('aria-checked')).toBe('true')
  })

  it('puts the switch back and says why when the server refuses', async () => {
    mocks.setConsent.mockRejectedValue(fail(400, { error: 'measures, photos and diet must each be true or false' }))
    const host = await open()
    tap(sw(host, 'Diet'))
    await settle()
    expect(sw(host, 'Diet').getAttribute('aria-checked')).toBe('false')
    expect(mocks.toast).toHaveBeenCalledWith('measures, photos and diet must each be true or false')
  })

  it('ignores a second tap while a save is in flight', async () => {
    let release
    mocks.setConsent.mockImplementation(c => new Promise(r => { release = () => r({ consent: c }) }))
    const host = await open()
    tap(sw(host, 'Diet'))
    // Busy, the switches say so but stay focusable: the tap itself is what is ignored.
    expect(sw(host, 'Diet').disabled).toBe(false)
    expect(sw(host, 'Body measurements').getAttribute('aria-disabled')).toBe('true')
    tap(sw(host, 'Body measurements'))
    expect(mocks.setConsent).toHaveBeenCalledTimes(1)
    await act(async () => { release() })
    expect(sw(host, 'Body measurements').getAttribute('aria-disabled')).toBe('false')
    tap(sw(host, 'Body measurements'))
    expect(mocks.setConsent).toHaveBeenCalledTimes(2)
    expect(mocks.setConsent).toHaveBeenLastCalledWith({ measures: false, photos: false, diet: true })
  })

  it('leaves only after the student confirms, then goes back to Settings with a fresh user', async () => {
    const host = await open()
    tap(button(host, 'Leave trainer'))
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(mocks.leaveTrainer).not.toHaveBeenCalled()
    const opts = mocks.confirmSheet.mock.calls[0][0]
    expect(opts.danger).toBe(true)
    await act(async () => { await opts.onConfirm() })
    expect(mocks.leaveTrainer).toHaveBeenCalledTimes(1)
    expect(mocks.api).toHaveBeenCalledWith('/api/me')
    expect(mocks.setUser).toHaveBeenCalledWith({ id: 'u1', name: 'Ana', role: 'student' })
    expect(mocks.nav).toHaveBeenCalledWith('/settings', { replace: true })
  })

  it('stays put and says why when leaving fails', async () => {
    mocks.leaveTrainer.mockRejectedValue(fail(500, { error: 'boom' }))
    const host = await open()
    tap(button(host, 'Leave trainer'))
    await act(async () => { await mocks.confirmSheet.mock.calls[0][0].onConfirm() })
    expect(mocks.toast).toHaveBeenCalledWith('boom')
    expect(mocks.nav).not.toHaveBeenCalled()
    expect(mocks.setUser).not.toHaveBeenCalled()
  })

  it('says a student without a trainer is not linked, and shows nothing else', async () => {
    mocks.myTrainer.mockResolvedValue({ trainer: null, since: null, consent: { measures: false, photos: false, diet: false, at: null } })
    const host = await open()
    expect(host.textContent).toContain('You are not linked to a trainer.')
    expect(host.querySelectorAll('[role="switch"]').length).toBe(0)
    expect(button(host, 'Leave trainer')).toBeUndefined()
  })

  it('offers to try again when the load fails', async () => {
    mocks.myTrainer.mockRejectedValueOnce(fail(500, { error: 'down' }))
    const host = await open()
    expect(host.querySelector('[role="alert"]')).toBeTruthy()
    expect(host.querySelectorAll('[role="switch"]').length).toBe(0)
    tap(button(host, 'Try again'))
    await settle()
    expect(mocks.myTrainer).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Rui')
  })
})
