import { describe, it, expect, vi } from 'vitest'
import { syncPrescription } from './prescription-sync.js'
import { applyPrescription } from './prescription.js'

const own = { id: 'own1', name: 'Push', ex: [] }
const r1 = { id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 5, weight: 100 }] }
const bundle = { opengym_plan: 1, unit: 'kg', week: { 1: ['r1'] }, routines: [r1], customEx: [] }

// A tiny store: update() runs the producer on a copy, like the real one.
function rig({ S = {}, rev, rx = { v: 3, bundle } } = {}) {
  const state = { S: { unit: 'kg', routines: [structuredClone(own)], week: {}, dayPlan: {}, ...S } }
  const asFn = x => (x instanceof Error ? vi.fn(async () => { throw x }) : vi.fn(async () => x))
  const h = {
    fetchRev: asFn(rev), fetchRx: asFn(rx), notify: vi.fn(),
    getS: () => state.S,
    update: vi.fn(fn => { const c = structuredClone(state.S); fn(c); state.S = c })
  }
  return { state, h }
}
const withRx = v => { const S = { unit: 'kg', routines: [structuredClone(own)], week: {}, dayPlan: {} }; applyPrescription(S, bundle, v); return S }

describe('syncPrescription', () => {
  it('same version: nothing downloaded', async () => {
    const { h } = rig({ S: withRx(2), rev: { v: 2 } })
    expect(await syncPrescription(h)).toBe('same')
    expect(h.fetchRx).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  it('a newer version is applied and announced', async () => {
    const { h, state } = rig({ rev: { v: 3 } })
    expect(await syncPrescription(h)).toBe('applied')
    expect(state.S.routines.map(r => r.id)).toEqual(['own1', 'rx-r1'])
    expect(h.notify).toHaveBeenCalledWith(3)
  })

  it('a workout in progress defers, before and after the download', async () => {
    const a = rig({ S: { active: { id: 'w' } }, rev: { v: 3 } })
    expect(await syncPrescription(a.h)).toBe('deferred')
    expect(a.h.fetchRx).not.toHaveBeenCalled()

    const b = rig({ rev: { v: 3 } })
    b.h.fetchRx = vi.fn(async () => { b.state.S = { ...b.state.S, active: { id: 'w' } }; return { v: 3, bundle } })
    expect(await syncPrescription(b.h)).toBe('deferred')
    expect(b.h.update).not.toHaveBeenCalled()
    expect(b.h.notify).not.toHaveBeenCalled()
  })

  it('no published plan removes the prescribed routines and keeps the students own', async () => {
    const { h, state } = rig({ S: withRx(1), rev: { v: null } })
    expect(await syncPrescription(h)).toBe('removed')
    expect(state.S.routines.map(r => r.id)).toEqual(['own1'])
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('no published plan and none present is the same', async () => {
    const { h } = rig({ rev: { v: null } })
    expect(await syncPrescription(h)).toBe('same')
    expect(h.update).not.toHaveBeenCalled()
  })

  it('a network failure leaves the plan alone', async () => {
    const { h, state } = rig({ S: withRx(1), rev: new TypeError('Failed to fetch') })
    const before = structuredClone(state.S)
    expect(await syncPrescription(h)).toBe('offline')
    expect(state.S).toEqual(before)
  })

  it('a server error other than 404 leaves the plan alone', async () => {
    const { h } = rig({ S: withRx(1), rev: Object.assign(new Error('boom'), { status: 500 }) })
    expect(await syncPrescription(h)).toBe('offline')
    expect(h.update).not.toHaveBeenCalled()
  })

  it('404 (not linked) removes the prescribed routines', async () => {
    const { h, state } = rig({ S: withRx(1), rev: Object.assign(new Error('nope'), { status: 404 }) })
    expect(await syncPrescription(h)).toBe('removed')
    expect(state.S.routines.map(r => r.id)).toEqual(['own1'])
  })

  it('a version that is not a number is offline, only null removes', async () => {
    for (const v of [undefined, '3']) {
      const { h, state } = rig({ S: withRx(1), rev: { v } })
      expect(await syncPrescription(h)).toBe('offline')
      expect(state.S.routines.map(r => r.id)).toEqual(['own1', 'rx-r1'])
    }
  })

  it('an update that throws on 404 is offline, not a rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { h } = rig({ S: withRx(1), rev: Object.assign(new Error('nope'), { status: 404 }) })
    h.update = vi.fn(() => { throw new Error('broken store') })
    expect(await syncPrescription(h)).toBe('offline')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns about a programming error, not about the network', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await syncPrescription(rig({ rev: new TypeError('Failed to fetch') }).h)
    expect(warn).not.toHaveBeenCalled()
    await syncPrescription(rig({ rev: { v: 3 }, rx: { v: 3, bundle: null } }).h)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('a failed download is offline and changes nothing', async () => {
    const { h, state } = rig({ rev: { v: 3 }, rx: new TypeError('Failed to fetch') })
    expect(await syncPrescription(h)).toBe('offline')
    expect(state.S.routines.map(r => r.id)).toEqual(['own1'])
  })
})

describe('syncPrescription with a program', () => {
  const r2 = { id: 'r2', name: 'Pull', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50 }] }
  const plan = (routines, week) => ({ opengym_plan: 1, unit: 'kg', week, routines, customEx: [] })
  const program = {
    start: '2026-11-02',
    phases: [
      { id: 'p1', name: 'Base', weeks: 4, bundle: plan([r1], { 1: ['r1'] }) },
      { id: 'p2', name: '', weeks: 4, bundle: plan([r2], { 3: ['r2'] }) }
    ]
  }
  const M1 = '2026-11-09', M2 = '2026-12-01'
  const err = (msg, status) => Object.assign(new Error(msg), status ? { status } : {})
  const mem = rec => {
    let c = rec
    return { read: vi.fn(() => c), write: vi.fn(x => { c = x }), clear: vi.fn(() => { c = null }), get: () => c }
  }
  function prig({ S, rev, rx = { v: 3, program, at: 'x', note: '' }, cached = null, today = M1 } = {}) {
    const r = rig({ S, rev, rx })
    r.h.cache = mem(cached)
    r.h.today = () => today
    return r
  }
  const ids = state => state.S.routines.map(r => r.id)
  const applied = (phase, v = 3) => {
    const S = { unit: 'kg', routines: [structuredClone(own)], week: {}, dayPlan: {} }
    applyPrescription(S, program.phases[phase].bundle, v, program.phases[phase].id)
    return S
  }

  it('a new version downloads, writes the cache and applies the phase of today', async () => {
    const { h, state } = prig({ rev: { v: 3 } })
    expect(await syncPrescription(h)).toBe('applied')
    expect(ids(state)).toEqual(['own1', 'rx-r1'])
    expect(state.S.routines[1].rx).toEqual({ v: 3, p: 'p1' })
    expect(h.cache.write).toHaveBeenCalledWith({ v: 3, program })
    expect(h.notify.mock.calls).toEqual([[3]])
  })

  it('a new version on a later month lands straight on that phase', async () => {
    const { h, state } = prig({ rev: { v: 3 }, today: M2 })
    expect(await syncPrescription(h)).toBe('applied')
    expect(ids(state)).toEqual(['own1', 'rx-r2'])
  })

  it('the month turns with the same version: no download, the cache is enough', async () => {
    const { h, state } = prig({ S: applied(0), rev: { v: 3 }, cached: { v: 3, program }, today: M2 })
    expect(await syncPrescription(h)).toBe('applied')
    expect(h.fetchRx).not.toHaveBeenCalled()
    expect(ids(state)).toEqual(['own1', 'rx-r2'])
    expect(state.S.routines[1].rx).toEqual({ v: 3, p: 'p2' })
    expect(h.notify.mock.calls).toEqual([[3, { name: '', index: 1 }]])
  })

  it('a named phase is announced by its name', async () => {
    const { h } = prig({ S: applied(1), rev: { v: 3 }, cached: { v: 3, program }, today: M1 })
    await syncPrescription(h)
    expect(h.notify.mock.calls).toEqual([[3, { name: 'Base', index: 0 }]])
  })

  it('the month turns while the network is down: the cache switches it', async () => {
    const { h, state } = prig({ S: applied(0), rev: new TypeError('Failed to fetch'), cached: { v: 3, program }, today: M2 })
    expect(await syncPrescription(h)).toBe('applied')
    expect(h.fetchRx).not.toHaveBeenCalled()
    expect(h.cache.clear).not.toHaveBeenCalled()
    expect(ids(state)).toEqual(['own1', 'rx-r2'])
  })

  it('no network and no cache: offline, the plan is untouched', async () => {
    const { h, state } = prig({ S: applied(0), rev: new TypeError('Failed to fetch'), today: M2 })
    const before = structuredClone(state.S)
    expect(await syncPrescription(h)).toBe('offline')
    expect(state.S).toEqual(before)
    expect(h.update).not.toHaveBeenCalled()
  })

  it('a server error with a cache is offline: nothing changes, the cache stays', async () => {
    const { h } = prig({ S: applied(0), rev: err('boom', 500), cached: { v: 3, program }, today: M2 })
    expect(await syncPrescription(h)).toBe('offline')
    expect(h.update).not.toHaveBeenCalled()
    expect(h.cache.clear).not.toHaveBeenCalled()
  })

  it('the same phase of the same version is the same', async () => {
    const { h } = prig({ S: applied(0), rev: { v: 3 }, cached: { v: 3, program } })
    expect(await syncPrescription(h)).toBe('same')
    expect(h.update).not.toHaveBeenCalled()
    expect(h.fetchRx).not.toHaveBeenCalled()
  })

  it('a workout in progress defers the switch without downloading', async () => {
    const S = { ...applied(0), active: { id: 'w' } }
    const a = prig({ S, rev: { v: 3 }, cached: { v: 3, program }, today: M2 })
    expect(await syncPrescription(a.h)).toBe('deferred')
    const b = prig({ S, rev: { v: 4 }, cached: { v: 3, program }, today: M2 })
    expect(await syncPrescription(b.h)).toBe('deferred')
    expect(b.h.fetchRx).not.toHaveBeenCalled()
    expect(b.h.update).not.toHaveBeenCalled()
  })

  it('a cache from an older version downloads again', async () => {
    const old = { v: 2, program: { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: plan([], {}) }] } }
    const { h, state } = prig({ rev: { v: 3 }, cached: old })
    expect(await syncPrescription(h)).toBe('applied')
    expect(h.fetchRx).toHaveBeenCalledTimes(1)
    expect(h.cache.get().v).toBe(3)
    expect(ids(state)).toEqual(['own1', 'rx-r1'])
  })

  it('not linked (404) clears the cache and the prescribed routines', async () => {
    const { h, state } = prig({ S: applied(0), rev: err('nope', 404), cached: { v: 3, program } })
    expect(await syncPrescription(h)).toBe('removed')
    expect(h.cache.clear).toHaveBeenCalled()
    expect(ids(state)).toEqual(['own1'])
  })

  it('no published plan (v null) clears the cache too', async () => {
    const { h } = prig({ rev: { v: null }, cached: { v: 3, program } })
    expect(await syncPrescription(h)).toBe('same')
    expect(h.cache.clear).toHaveBeenCalled()
  })

  it('a phase with no routines and nothing prescribed is the same, and says nothing', async () => {
    const empty = { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: plan([], {}) }] }
    const { h } = prig({ rev: { v: 3 }, rx: { v: 3, program: empty } })
    expect(await syncPrescription(h)).toBe('same')
    expect(h.update).not.toHaveBeenCalled()
    expect(h.notify).not.toHaveBeenCalled()
  })

  it('an empty phase after a full one clears the prescribed routines', async () => {
    const two = { start: '2026-11-02', phases: [program.phases[0], { id: 'p2', name: 'Rest', weeks: 1, bundle: plan([], {}) }] }
    const { h, state } = prig({ S: applied(0), rev: { v: 3 }, cached: { v: 3, program: two }, today: M2 })
    expect(await syncPrescription(h)).toBe('applied')
    expect(ids(state)).toEqual(['own1'])
  })

  it('a stage 2a answer (only a bundle) is a single phase that never ends', async () => {
    const { h, state } = prig({ rev: { v: 3 }, rx: { v: 3, bundle }, today: '2031-01-01' })
    expect(await syncPrescription(h)).toBe('applied')
    expect(ids(state)).toEqual(['own1', 'rx-r1'])
    expect(state.S.routines[1].rx).toEqual({ v: 3, p: 'p1' })
    expect(h.cache.get().program.phases).toHaveLength(1)
  })

  it('a plan the stage 2a app applied (no phase) is the same version, no download', async () => {
    const { h } = prig({ S: withRx(3), rev: { v: 3 } })
    expect(await syncPrescription(h)).toBe('same')
    expect(h.fetchRx).not.toHaveBeenCalled()
    expect(h.cache.write).not.toHaveBeenCalled()
  })
})
