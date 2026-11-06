import { describe, it, expect } from 'vitest'
import { RX_PREFIX, isPrescribed, appliedVersion, applyPrescription, removePrescription } from './prescription.js'
import { convertWeight } from './units.js'

const own = { id: 'own1', name: 'Push', ex: [] }
const bundleOf = (routines, week, unit = 'kg') => ({ opengym_plan: 1, unit, week, routines, customEx: [] })
const r1 = { id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3, reps: 5, weight: 100 }] }
const r2 = { id: 'r2', name: 'Pull', ex: [{ id: '0025', sets: 3, reps: 8, weight: 50 }] }
const stateOf = () => ({ unit: 'kg', routines: [structuredClone(own)], week: { 1: ['own1'] }, dayPlan: {} })

describe('applyPrescription', () => {
  it('adds the prescribed routines after the student\'s own and marks them', () => {
    const S = stateOf()
    const res = applyPrescription(S, bundleOf([r1, r2], { 1: ['r1'], 3: 'r2' }), 1)
    expect(S.routines.map(r => r.id)).toEqual(['own1', 'rx-r1', 'rx-r2'])
    expect(S.week).toEqual({ 1: ['own1', 'rx-r1'], 3: ['rx-r2'] })
    for (const r of S.routines.slice(1)) {
      expect(r.rx).toEqual({ v: 1 })
      expect(r.excludeFromProgression).toBe(true)
    }
    expect(res).toEqual({ added: 2, removed: 0, dropped: 0 })
  })

  it('is idempotent, even when the bundle repeats an id in a day', () => {
    const S = stateOf()
    const bundle = bundleOf([r1, r2], { 1: ['r1', 'r1'], 3: ['r2'] })
    applyPrescription(S, bundle, 1)
    const once = structuredClone(S)
    const res = applyPrescription(S, bundle, 1)
    expect(S).toEqual(once)
    expect(S.week[1]).toEqual(['own1', 'rx-r1'])
    expect(res.added).toBe(0)
  })

  it('a newer version drops what left the plan and replaces the rest in place', () => {
    const S = stateOf()
    applyPrescription(S, bundleOf([r1, r2], { 1: ['r1'], 3: ['r2'] }), 1)
    S.dayPlan['2026-11-09'] = 'rx-r2'
    const renamed = { ...r1, name: 'Push B' }
    const res = applyPrescription(S, bundleOf([renamed], { 1: ['r1'] }), 2)
    expect(S.routines.map(r => r.id)).toEqual(['own1', 'rx-r1'])
    expect(S.routines[1]).toMatchObject({ name: 'Push B', rx: { v: 2 } })
    expect(S.week).toEqual({ 1: ['own1', 'rx-r1'] })
    expect(S.dayPlan).toEqual({})
    expect(res).toEqual({ added: 0, removed: 1, dropped: 0 })
  })

  it('keeps the index of a routine it replaces when others are added', () => {
    const S = stateOf()
    applyPrescription(S, bundleOf([r1], { 1: ['r1'] }), 1)
    S.routines.push({ id: 'own2', name: 'Legs', ex: [] })
    applyPrescription(S, bundleOf([r2, r1], { 1: ['r1'], 3: ['r2'] }), 2)
    expect(S.routines.map(r => r.id)).toEqual(['own1', 'rx-r1', 'own2', 'rx-r2'])
  })

  it('moves a prescribed routine off a day the new version no longer lists', () => {
    const S = stateOf()
    applyPrescription(S, bundleOf([r1], { 1: ['r1'] }), 1)
    applyPrescription(S, bundleOf([r1], { 3: ['r1'] }), 2)
    expect(S.week).toEqual({ 1: ['own1'], 3: ['rx-r1'] })
  })

  it('never touches the student\'s own routine with the same name', () => {
    const S = stateOf()
    applyPrescription(S, bundleOf([r1], { 1: ['r1'] }), 1)
    applyPrescription(S, bundleOf([], {}), 2)
    expect(S.routines).toEqual([own])
    expect(S.week).toEqual({ 1: ['own1'] })
  })

  it('converts weights to the student\'s unit', () => {
    const S = { ...stateOf(), unit: 'lb' }
    applyPrescription(S, bundleOf([r1], { 1: ['r1'] }, 'kg'), 1)
    const w = S.routines[1].ex[0].weight
    expect(w).toBe(convertWeight(100, 'kg', 'lb'))
    expect(w).not.toBe(100)
  })

  it('drops an unknown exercise, keeps the routine and counts it', () => {
    const S = stateOf()
    const ghost = { id: 'g', name: 'Ghost', ex: [{ id: 'no-such-exercise', sets: 3, reps: 5 }] }
    const res = applyPrescription(S, bundleOf([ghost], { 2: ['g'] }), 1)
    expect(S.routines.find(r => r.id === 'rx-g').ex).toEqual([])
    expect(S.week[2]).toEqual(['rx-g'])
    expect(res.dropped).toBe(1)
  })
})

describe('applyPrescription, a hostile bundle', () => {
  it('clamps numbers, caps text and drops what is not finite', () => {
    const S = stateOf()
    const r = { id: 'h', name: 'x'.repeat(500), ex: [{ id: '0025', sets: 1e9, reps: -3, weight: Infinity, restSec: 'NaN', note: 'n'.repeat(5000), setsMax: 99 }] }
    applyPrescription(S, bundleOf([r], {}), 1)
    const got = S.routines.find(x => x.id === 'rx-h')
    const e = got.ex[0]
    expect(e.sets).toBe(20)
    expect(e.reps).toBe(0)
    expect('weight' in e).toBe(false)
    expect('restSec' in e).toBe(false)
    expect(e.note.length).toBe(500)
    expect(e.setsMax).toBe(10)
    expect(got.name.length).toBe(60)
  })

  it('keeps a valid prescription exactly as written', () => {
    const S = stateOf()
    const ex = { id: '0025', sets: 4, reps: 8, repsMin: 6, repsMax: 10, weight: 62.5, restSec: 90, note: 'Pause at the bottom' }
    applyPrescription(S, bundleOf([{ id: 'v', name: 'Legs', ex: [ex] }], {}), 1)
    expect(S.routines.find(x => x.id === 'rx-v').ex[0]).toMatchObject(ex)
  })

  it('strips the sync stamps a bundle carries', () => {
    const S = stateOf()
    const r = { id: 'h', name: 'H', _f: { ex: 9e15 }, _ts: 9e15, _u: 'x', ex: [{ id: '0025', sets: 3, _f: { sets: 9e15 }, _ts: 1, _u: 'y' }] }
    applyPrescription(S, bundleOf([r], {}), 1)
    const got = S.routines.find(x => x.id === 'rx-h')
    for (const o of [got, got.ex[0]]) for (const k of ['_f', '_ts', '_u']) expect(k in o).toBe(false)
  })

  it('never overwrites or duplicates an own routine whose id looks prescribed', () => {
    const S = { ...stateOf(), routines: [structuredClone(own), { id: 'rx-a', name: 'Mine', ex: [] }], week: { 1: ['own1'], 2: ['rx-a'] } }
    const res = applyPrescription(S, bundleOf([{ id: 'a', name: 'Theirs', ex: [] }, r1], { 2: ['a'], 4: ['r1'] }), 1)
    expect(S.routines.filter(x => x.id === 'rx-a')).toEqual([{ id: 'rx-a', name: 'Mine', ex: [] }])
    expect(S.week).toEqual({ 1: ['own1'], 2: ['rx-a'], 4: ['rx-r1'] })
    expect(res).toMatchObject({ added: 1, dropped: 1 })
  })

  it('writes only weekdays 0 to 6', () => {
    const S = stateOf()
    const week = JSON.parse('{"1":["r1"],"9":["r1"],"foo":["r1"],"__proto__":["r1"]}')
    applyPrescription(S, bundleOf([r1], week), 1)
    expect(Object.keys(S.week)).toEqual(['1'])
    expect(Object.getPrototypeOf(S.week)).toBe(Object.prototype)
  })

  it('does not change the bundle it is given', () => {
    const bundle = bundleOf([{ id: 'h', name: 'H', _f: { ex: 1 }, ex: [{ id: '0025', sets: 1e9, note: 'n'.repeat(900) }] }, r1], { 1: ['h'], 9: ['r1'] })
    const before = structuredClone(bundle)
    applyPrescription(stateOf(), bundle, 1)
    expect(bundle).toEqual(before)
  })
})

describe('removePrescription', () => {
  it('removes only the prescribed routines and their days', () => {
    const S = stateOf()
    applyPrescription(S, bundleOf([r1, r2], { 1: ['r1'], 3: ['r2'] }), 1)
    expect(removePrescription(S)).toBe(2)
    expect(S.routines).toEqual([own])
    expect(S.week).toEqual({ 1: ['own1'] })
    expect(removePrescription(S)).toBe(0)
  })
})

describe('appliedVersion / isPrescribed', () => {
  it('is 0 with no prescribed routine, else the highest version', () => {
    expect(appliedVersion(stateOf())).toBe(0)
    expect(appliedVersion({ routines: [{ id: 'a', rx: { v: 2 } }, { id: 'b', rx: { v: 3 } }, { id: 'c' }] })).toBe(3)
    expect(isPrescribed({ rx: { v: 1 } })).toBe(true)
    expect(isPrescribed(own)).toBe(false)
    expect(RX_PREFIX).toBe('rx-')
  })
})
