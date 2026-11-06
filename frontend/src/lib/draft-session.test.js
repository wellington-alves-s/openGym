// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { DraftSessionContext, PhaseGate, UnderPageContext, createDraftSessions } from './draft-session.js'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The draft session behind the trainer's editors: one per document, saved 800 ms after the last
   change with the revision the previous save returned, a program edited one phase at a time. */
const bundle = (name, extra = {}) => ({ opengym_plan: 1, unit: 'kg', week: { 1: ['r1'] }, routines: [{ id: 'r1', name, ex: [{ id: '0025', sets: 3, reps: 5, weight: 100 }] }], customEx: [], ...extra })
const program = (...phases) => ({ start: null, phases: phases.length ? phases : [{ id: 'a', name: 'One', weeks: 4, bundle: bundle('A') }, { id: 'b', name: 'Two', weeks: 4, bundle: bundle('B') }] })
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const wait = async ms => { vi.advanceTimersByTime(ms); await tick() }
const rename = (s, name) => s.store.getState().update(S => { S.routines[0].name = name })

let load, save, reg, pages
function setup(rev = 5, prog = program()) {
  load = vi.fn(async () => ({ program: structuredClone(prog), rev }))
  save = vi.fn(async (key, p, r) => ({ rev: r + 1 }))
  reg = createDraftSessions({ load: (...a) => load(...a), save: (...a) => save(...a), backTo: (key, id) => `/k/${key}/${id}` })
}
async function open(key = 'k1') { pages.push(reg.page(key)); const s = await reg.ensure(key); pages.push(reg.acquire(s)); return s }

beforeEach(() => { vi.useFakeTimers(); useStore.setState({ S: { ...structuredClone(DEF), unit: 'kg' }, user: null }); pages = []; setup() })
afterEach(() => { pages.forEach(f => f()); for (const k of ['k1', 'k2']) reg.dropSession(k); vi.useRealTimers() })

describe('createDraftSessions', () => {
  it('turns two quick edits into one save, then sends the revision that save returned', async () => {
    const s = await open()
    expect(s.phaseId).toBe('a')
    expect(s.store.getState().S.routines[0].name).toBe('A')
    expect(s.store.getState().S.workouts).toEqual([])
    expect(s.store.getState().backTo).toBe('/k/k1/a')
    rename(s, 'X'); await wait(500)
    rename(s, 'Y'); await wait(799)
    expect(save).not.toHaveBeenCalled()
    await wait(1)
    expect(save).toHaveBeenCalledTimes(1)
    const [key, p, rev] = save.mock.calls[0]
    expect(key).toBe('k1'); expect(rev).toBe(5)
    expect(p.phases.map(ph => ph.bundle.routines[0].name)).toEqual(['Y', 'B'])
    expect(s.status).toBe('saved')
    rename(s, 'Z'); await wait(800)
    expect(save.mock.calls[1][2]).toBe(6)
  })

  it('sends an edit made during a save once it returns, with the revision it returned', async () => {
    let release
    save.mockImplementationOnce(() => new Promise(r => { release = r }))
    const s = await open()
    rename(s, 'X'); await wait(800)
    expect(s.status).toBe('saving')
    rename(s, 'Y'); await wait(800)
    expect(save).toHaveBeenCalledTimes(1)
    release({ rev: 6 }); await tick()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][1].phases[0].bundle.routines[0].name).toBe('Y')
    expect(save.mock.calls[1][2]).toBe(6)
  })

  it('a 409 stops saving until dropSession, and the next ensure reads the document again', async () => {
    save.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
    const s = await open()
    rename(s, 'Mine'); await wait(800)
    expect(s.status).toBe('conflict')
    await expect(reg.whenSaved('k1')).rejects.toMatchObject({ status: 409 })
    rename(s, 'Again'); s.updateProgram(p => { p.start = '2026-11-09' }); await wait(2000)
    expect(save).toHaveBeenCalledTimes(1)
    reg.dropSession('k1')
    expect(reg.sessionOf('k1')).toBeNull()
    const next = await reg.ensure('k1')
    expect(load).toHaveBeenCalledTimes(2)
    expect(next).not.toBe(s)
    expect(next.store.getState().S.routines[0].name).toBe('A')
  })

  it.each([
    ['the plan wording by default', undefined, 'The plan changed somewhere else'],
    ['the wording the registry was given', () => 'The model changed somewhere else', 'The model changed somewhere else'],
  ])('leaving after a 409 says so in %s', async (_, changedText, said) => {
    const toast = vi.fn()
    const real = useUI.getState().toast
    useUI.setState({ toast })
    onTestFinished(() => useUI.setState({ toast: real }))
    reg = createDraftSessions({ load: (...a) => load(...a), save: (...a) => save(...a), backTo: () => '/x', changedText })
    let reject
    save.mockImplementationOnce(() => new Promise((_, no) => { reject = no }))
    const s = await open()
    rename(s, 'Mine'); await wait(800)
    rename(s, 'Mine again')   // waits behind the save the 409 answers
    reject(Object.assign(new Error('conflict'), { status: 409 })); await tick()
    pages.splice(0).reverse().forEach(f => f()); await tick()
    expect(toast).toHaveBeenCalledWith(said)
  })

  it('openPhase keeps the open phase edits in the program, shows the other phase, and changes nothing', async () => {
    const s = await open()
    const store = s.store
    s.openPhase('b')
    expect(s.store).toBe(store)
    expect(s.phaseId).toBe('b')
    expect(store.getState().S.routines[0].name).toBe('B')
    expect(store.getState().backTo).toBe('/k/k1/b')
    await wait(5000)
    expect(save).not.toHaveBeenCalled()
    s.openPhase('a'); rename(s, 'Edited a'); s.openPhase('b')
    expect(s.program.phases[0].bundle.routines[0].name).toBe('Edited a')
    expect(store.getState().S.routines[0].name).toBe('B')
    await wait(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][1].phases.map(ph => ph.bundle.routines[0].name)).toEqual(['Edited a', 'B'])
  })

  it('updateProgram saves the program with the change and the unsaved edit of the open phase', async () => {
    const s = await open()
    rename(s, 'Unsaved')
    const before = s.program
    s.updateProgram(p => { p.phases[1].name = 'Renamed' })
    expect(s.program).not.toBe(before)
    expect(before.phases[1].name).toBe('Two')
    await wait(800)
    expect(save).toHaveBeenCalledTimes(1)
    const sent = save.mock.calls[0][1]
    expect(sent.phases[1].name).toBe('Renamed')
    expect(sent.phases[0].bundle.routines[0].name).toBe('Unsaved')
  })

  it('removing the open phase shows the first one left', async () => {
    const s = await open()
    s.openPhase('b')
    s.updateProgram(p => { p.phases = p.phases.filter(ph => ph.id !== 'b') })
    expect(s.phaseId).toBe('a')
    expect(s.store.getState().S.routines[0].name).toBe('A')
    await wait(800)
    expect(save.mock.calls[0][1].phases.map(ph => ph.id)).toEqual(['a'])
  })

  it('a phase that cannot be read leaves the open phase and its edits where they were', async () => {
    setup(5, program({ id: 'a', name: '', weeks: 4, bundle: bundle('A') }, { id: 'b', name: '', weeks: 4, bundle: { opengym_plan: 0 } }))
    const s = await open()
    rename(s, 'Kept')
    expect(() => s.openPhase('b')).toThrow()
    expect(s.phaseId).toBe('a')
    rename(s, 'Kept again'); await wait(800)
    const sent = save.mock.calls.at(-1)[1]
    expect(sent.phases[0].bundle.routines[0].name).toBe('Kept again')
    expect(sent.phases[1].bundle).toEqual({ opengym_plan: 0 })
  })

  it('a change that leaves no phase is ignored', async () => {
    const s = await open()
    const before = s.program
    s.updateProgram(p => { p.phases = [] })
    expect(s.program.phases.map(ph => ph.id)).toEqual(['a', 'b'])
    expect(s.program).toEqual(before)
    await wait(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it.each([['lb', 'kg', 220.46], ['kg', 'lb', 45.36]])('a trainer in %s sees a %s phase converted once, and saves with no drift', async (own, stored, shown) => {
    useStore.setState({ S: { ...structuredClone(DEF), unit: own } })
    setup(5, program({ id: 'a', name: '', weeks: 0, bundle: bundle('A', { unit: stored }) }))
    let doc
    save.mockImplementation(async (key, p, r) => { doc = structuredClone(p); return { rev: r + 1 } })
    let s = await open()
    expect(s.store.getState().S.unit).toBe(own)
    expect(s.store.getState().S.routines[0].ex[0].weight).toBeCloseTo(shown, 0)
    for (let i = 0; i < 3; i++) {
      rename(s, 'R' + i); await wait(800)
      expect(doc.phases[0].bundle.unit).toBe(own)
      expect(doc.phases[0].bundle.routines[0].ex[0].weight).toBeCloseTo(shown, 0)
      pages.forEach(f => f()); pages = []; await tick()
      load.mockResolvedValue({ program: doc, rev: 9 })
      s = await open()
      expect(s.store.getState().S.routines[0].ex[0].weight).toBeCloseTo(shown, 0)
    }
  })

  it('a change of account drops every session and the revisions it remembered', async () => {
    useStore.setState({ user: { id: 't1' } })
    const s = await open()
    rename(s, 'X'); await wait(800)
    expect(await reg.whenSaved('k1')).toBe(6)
    pages.forEach(f => f()); pages = []; await tick()
    pages.push(reg.page('k2')); await reg.ensure('k2')
    useStore.setState({ user: { id: 't2' } })
    expect(reg.sessionOf('k2')).toBeNull()
    expect(await reg.whenSaved('k1')).toBeUndefined()
  })

  it('flush waits for chained saves', async () => {
    let release
    save.mockImplementationOnce(() => new Promise(r => { release = r }))
    const s = await open()
    rename(s, 'X'); await wait(800)
    rename(s, 'Y')
    const done = s.flush()
    release({ rev: 6 })
    expect(await done).toBe(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(s.rev).toBe(7)
  })

  it('a save that fails keeps the session after leaving, and the next visit saves with the held revision', async () => {
    const offline = () => Object.assign(new Error('offline'), { status: 0 })
    save.mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline())
    const s = await open()
    rename(s, 'Offline')
    pages.forEach(f => f()); pages = []; await tick()
    expect(save).toHaveBeenCalledTimes(1)
    await expect(reg.whenSaved('k1')).rejects.toThrow()
    expect(reg.sessionOf('k1')).toBe(s)
    expect(await open()).toBe(s)
    await wait(800)
    expect(load).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(3)
    expect(save.mock.calls[2][1].phases[0].bundle.routines[0].name).toBe('Offline')
    expect(save.mock.calls[2][2]).toBe(5)
  })

  it('keeps two keys apart', async () => {
    load.mockImplementation(async key => ({ program: program({ id: 'a', name: '', weeks: 0, bundle: bundle(key) }), rev: key === 'k1' ? 1 : 20 }))
    const one = await open('k1'), two = await open('k2')
    expect(one.store).not.toBe(two.store)
    rename(one, 'one'); await wait(800)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]).toEqual(['k1', expect.anything(), 1])
    rename(two, 'two'); await wait(800)
    expect(save.mock.calls[1][0]).toBe('k2')
    expect(save.mock.calls[1][1].phases[0].bundle.routines[0].name).toBe('two')
    expect(save.mock.calls[1][2]).toBe(20)
    expect(await reg.whenSaved('k1')).toBe(2)
  })

  it('two registries do not interfere, and the page hiding saves each once', async () => {
    const other = vi.fn(async (key, p, r) => ({ rev: r + 1 }))
    const reg2 = createDraftSessions({ load: async () => ({ program: program(), rev: 1 }), save: other, backTo: () => '/m' })
    const s = await open()
    pages.push(reg2.page('k1')); const m = await reg2.ensure('k1')
    expect(m).not.toBe(s)
    rename(s, 'student'); rename(m, 'model')
    window.dispatchEvent(new Event('pagehide'))
    expect(save).toHaveBeenCalledTimes(1); expect(other).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][1].phases[0].bundle.routines[0].name).toBe('student')
    expect(other.mock.calls[0][1].phases[0].bundle.routines[0].name).toBe('model')
    await tick()
    reg2.dropSession('k1')
    expect(reg.sessionOf('k1')).toBe(s)
  })

  it('a document that loads after every page has gone makes no session', async () => {
    let release
    load.mockReturnValueOnce(new Promise(r => { release = r }))
    const leave = reg.page('k1')
    const p = reg.ensure('k1')
    leave()
    release({ program: program(), rev: 5 })
    expect(await p).toBeNull()
    expect(reg.sessionOf('k1')).toBeNull()
  })
})

describe('PhaseGate', () => {
  it('opens the phase of the route on the session, then shows the page', async () => {
    const s = await open()
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host)
    const Page = () => React.createElement('p', null, s.store.getState().S.routines[0].name)
    act(() => root.render(React.createElement(MemoryRouter, { initialEntries: ['/p/b'] },
      React.createElement(DraftSessionContext.Provider, { value: s },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/p/:phase', element: React.createElement(PhaseGate) },
            React.createElement(Route, { index: true, element: React.createElement(Page) })))))))
    expect(s.phaseId).toBe('b')
    expect(host.textContent).toBe('B')
    act(() => root.unmount()); host.remove()
  })

  // An edge swipe back draws the page it returns to underneath the visible one, both on one session.
  it('a page drawn underneath never takes the phase from the visible page, and opens its own once it is the page', async () => {
    const s = await open()
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host)
    const Page = () => React.createElement('p', null, s.store.getState().S.routines[0].name)
    const gate = (path, under) => React.createElement(UnderPageContext.Provider, { value: under },
      React.createElement(MemoryRouter, { initialEntries: [path] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/p/:phase', element: React.createElement(PhaseGate) },
            React.createElement(Route, { index: true, element: React.createElement(Page) })))))
    const render = underA => act(() => root.render(React.createElement(DraftSessionContext.Provider, { value: s },
      React.createElement('div', { id: 'top' }, gate('/p/b', false)), React.createElement('div', { id: 'under' }, gate('/p/a', underA)))))
    render(true)
    expect(s.phaseId).toBe('b')
    expect(host.querySelector('#top').textContent).toBe('B')
    expect(host.querySelector('#under').textContent).toBe('')
    render(false)
    expect(s.phaseId).toBe('a')
    expect(host.querySelector('#under').textContent).toBe('A')
    act(() => root.unmount()); host.remove()
  })

  it('a phase the program does not have goes back to the program', async () => {
    const s = await open()
    const host = document.createElement('div'); document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(React.createElement(MemoryRouter, { initialEntries: ['/p/gone/r1'] },
      React.createElement(DraftSessionContext.Provider, { value: s },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/p', element: React.createElement('p', null, 'program') }),
          React.createElement(Route, { path: '/p/:phase', element: React.createElement(PhaseGate) },
            React.createElement(Route, { path: ':id', element: React.createElement('p', null, 'editor') })))))))
    expect(host.textContent).toBe('program')
    expect(s.phaseId).toBe('a')
    act(() => root.unmount()); host.remove()
  })
})
