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
