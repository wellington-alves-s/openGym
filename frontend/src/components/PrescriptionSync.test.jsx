// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

const rev = vi.fn()
const rx = vi.fn()
vi.mock('../lib/trainer-api.js', () => ({
  studentRxRev: (...a) => rev(...a), studentRx: (...a) => rx(...a), listStudents: vi.fn(async () => [])
}))
vi.mock('../lib/api.js', async importOriginal => ({
  ...await importOriginal(), api: vi.fn(() => Promise.resolve({})), beacon: vi.fn()
}))
const { default: PrescriptionSync } = await import('./PrescriptionSync.jsx')
const { default: App } = await import('../App.jsx')

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original

beforeEach(() => {
  original = useStore.getState()
  rev.mockReset(); rx.mockReset()
  rev.mockResolvedValue({ v: null })
  window.scrollTo = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  useStore.setState({ S: structuredClone(DEF), ready: true, boot: vi.fn() })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState(original)
  localStorage.clear()
})

const mount = async () => { await act(async () => root.render(<PrescriptionSync />)) }
const flush = () => act(async () => { await Promise.resolve() })
const visibility = value => Object.defineProperty(document, 'visibilityState', { value, configurable: true })

describe('PrescriptionSync', () => {
  it('asks once on mount, again when the tab becomes visible, and on online', async () => {
    await mount()
    expect(rev).toHaveBeenCalledTimes(1)
    visibility('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(rev).toHaveBeenCalledTimes(2)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(rev).toHaveBeenCalledTimes(3)
  })

  it('does not ask when the tab goes hidden, nor after unmount', async () => {
    await mount()
    visibility('hidden')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(rev).toHaveBeenCalledTimes(1)
    act(() => root.unmount())
    root = createRoot(host)
    visibility('visible')
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(rev).toHaveBeenCalledTimes(1)
  })

  it('skips a trigger while one is in flight', async () => {
    let done
    rev.mockReturnValue(new Promise(r => { done = r }))
    await mount()
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(rev).toHaveBeenCalledTimes(1)
    rev.mockResolvedValue({ v: null })
    done({ v: null }); await flush()
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(rev).toHaveBeenCalledTimes(2)
  })

  it('applies a new plan and tells the student', async () => {
    const bundle = { opengym_plan: 1, unit: 'kg', week: {}, routines: [{ id: 'r1', name: 'Push', ex: [] }], customEx: [] }
    rev.mockResolvedValue({ v: 1 })
    rx.mockResolvedValue({ v: 1, bundle })
    await mount(); await flush()
    expect(useStore.getState().S.routines.some(r => r.id === 'rx-r1')).toBe(true)
    expect(useUI.getState().toastMsg).toBe('Your trainer updated your training')
  })

  describe('a sign-out during a slow download', () => {
    const bundle = { opengym_plan: 1, unit: 'kg', week: {}, routines: [{ id: 'r1', name: 'Push', ex: [] }], customEx: [] }
    const slow = async leave => {
      useStore.setState({ user: { id: 'u1', role: 'student' } })
      useUI.setState({ toastMsg: null })
      let release
      rev.mockResolvedValue({ v: 1 })
      rx.mockReturnValue(new Promise(r => { release = r }))
      await mount(); await flush()
      expect(rx).toHaveBeenCalledTimes(1)
      await act(async () => leave())
      await act(async () => { release({ v: 1, bundle }) }); await flush()
      expect(useStore.getState().S.routines.some(r => r.id === 'rx-r1')).toBe(false)
      expect(useUI.getState().toastMsg).toBeFalsy()
    }
    it('leaves the signed-out copy alone when the user is gone', () => slow(() => useStore.setState({ user: null })))
    it('leaves it alone once unmounted', () => slow(() => { root.unmount(); root = createRoot(host) }))
  })
})

describe('who gets it in App', () => {
  const user = role => ({ id: 'u1', name: 'Ana', ...(role ? { role } : {}), ...(role === 'trainer' ? { trainerStatus: 'approved' } : {}) })
  const open = async u => {
    useStore.setState({ user: u })
    window.location.hash = '#/home'
    await act(async () => root.render(<App />))
  }

  it('a student triggers it', async () => {
    await open(user('student'))
    expect(rev).toHaveBeenCalledTimes(1)
  })

  it('an account still holding prescribed routines asks, and a 404 takes them away', async () => {
    rev.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }))
    useStore.setState({ S: { ...structuredClone(DEF), routines: [{ id: 'rx-r1', name: 'Push', rx: { v: 2 }, ex: [] }] } })
    await open(user(null)); await flush()
    expect(rev).toHaveBeenCalledTimes(1)
    expect(useStore.getState().S.routines.some(r => r.id === 'rx-r1')).toBe(false)
  })

  it('an account with no role and a trainer do not', async () => {
    await open(user(null))
    expect(rev).not.toHaveBeenCalled()
    act(() => root.unmount()); root = createRoot(host)
    await open(user('trainer'))
    expect(rev).not.toHaveBeenCalled()
  })
})
