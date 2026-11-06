// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { bundleOf, createWorkspaceStore } from './workspace.js'

const own = () => ({ unit: 'lb', routines: [{ id: 'mine', name: 'Mine', ex: [] }], week: { 1: ['mine'] }, dayPlan: { '2026-11-06': 'a' }, customEx: [{ id: 'c1' }], wc: { swipeSets: true } })
const bundle = () => ({ opengym_plan: 1, unit: 'kg', week: { 2: ['a'] }, routines: [{ id: 'a', name: 'A', ex: [{ id: '0025', sets: 3 }] }], customEx: [] })

describe('createWorkspaceStore', () => {
  it('builds S from the trainer settings and the bundle plan, without touching either', () => {
    const ownS = own(), b = bundle()
    const before = JSON.stringify([ownS, b])
    const store = createWorkspaceStore(ownS, b, { backTo: '/trainer/s1' })
    const { S, prescription, backTo } = store.getState()
    expect(prescription).toBe(true)
    expect(backTo).toBe('/trainer/s1')
    expect(S.routines).toEqual(b.routines)
    expect(S.routines).not.toBe(b.routines)
    expect(S.week).toEqual(b.week)
    expect(S.unit).toBe('kg')
    expect(S.customEx).toEqual([])
    expect(S.wc).toEqual({ swipeSets: true })
    store.getState().update(s => { s.routines[0].name = 'Changed'; s.routines[0].ex.push({ id: '0334' }) })
    expect(JSON.stringify([ownS, b])).toBe(before)
  })

  it('update edits only the workspace copy, and deleting a routine leaves the trainer state alone', () => {
    const ownS = own()
    const store = createWorkspaceStore(ownS, { ...bundle(), routines: [{ id: 'a', name: 'A', ex: [] }, { id: 'mine', name: 'X', ex: [] }] }, {})
    const first = store.getState().S
    store.getState().update(s => { s.routines[0].name = 'B' })
    expect(store.getState().S.routines[0].name).toBe('B')
    expect(first.routines[0].name).toBe('A')
    store.getState().update(s => {
      s.routines = s.routines.filter(r => r.id !== 'mine')
      Object.keys(s.dayPlan || {}).forEach(k => delete s.dayPlan[k])
    })
    expect(store.getState().S.routines.map(r => r.id)).toEqual(['a'])
    expect(ownS.dayPlan).toEqual({ '2026-11-06': 'a' })
    expect(ownS.routines.map(r => r.id)).toEqual(['mine'])
    expect(() => store.getState().autoBackupNow()).not.toThrow()
  })
})

describe('bundleOf', () => {
  it('returns the plan of the workspace, keeping the bundle marker and no own exercises', () => {
    const store = createWorkspaceStore(own(), bundle(), {})
    store.getState().update(s => { s.week[3] = ['a'] })
    const out = bundleOf(store.getState().S, bundle())
    expect(out).toEqual({ opengym_plan: 1, unit: 'kg', week: { 2: ['a'], 3: ['a'] }, routines: bundle().routines, customEx: [] })
    expect(out.dayPlan).toBeUndefined()
  })
})
