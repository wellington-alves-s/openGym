// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readCache, writeCache, clearCache } from './prescription-cache.js'

const program = { start: '2026-11-02', phases: [{ id: 'p1', name: '', weeks: 4, bundle: { routines: [] } }] }

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('prescription cache', () => {
  it('round-trips under a key bound to the account', () => {
    writeCache('u1', { v: 3, program })
    expect(readCache('u1')).toEqual({ v: 3, program })
    expect(localStorage.getItem('gym_rx_v1:u1')).not.toBeNull()
  })

  it('another account reads nothing', () => {
    writeCache('u1', { v: 3, program })
    expect(readCache('u2')).toBeNull()
  })

  it('clear removes it', () => {
    writeCache('u1', { v: 3, program })
    clearCache('u1')
    expect(readCache('u1')).toBeNull()
  })

  it('anything not shaped { v: number, program: { phases: [] } } reads null', () => {
    const put = x => localStorage.setItem('gym_rx_v1:u1', typeof x === 'string' ? x : JSON.stringify(x))
    for (const bad of ['{nope', 'null', '5', { v: '3', program }, { v: 3 }, { v: 3, program: {} }, { v: 3, program: { phases: 'x' } }, { v: 3, program: { phases: [{}] } }, { v: 3, program: { phases: [null] } }, { v: NaN, program }]) {
      put(bad)
      expect(readCache('u1')).toBeNull()
    }
  })

  it('a start that is not null or a YYYY-MM-DD date, or a phase bundle without a routines list, reads null', () => {
    const put = x => localStorage.setItem('gym_rx_v1:u1', JSON.stringify(x))
    const ph = program.phases[0]
    for (const bad of [{ ...program, start: 5 }, { ...program, start: 'x' }, { ...program, start: '2026-11-2' }, { ...program, start: undefined },
      { ...program, phases: [{ ...ph, bundle: null }] }, { ...program, phases: [{ ...ph, bundle: 'x' }] }, { ...program, phases: [{ ...ph, bundle: { routines: 'x' } }] }, { ...program, phases: [{ ...ph, bundle: undefined }] }]) {
      put({ v: 3, program: bad })
      expect(readCache('u1'), JSON.stringify(bad)).toBeNull()
    }
    put({ v: 3, program: { ...program, start: null } })
    expect(readCache('u1')).not.toBeNull()
  })

  it('a localStorage that throws never breaks it', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    expect(readCache('u1')).toBeNull()
    expect(() => writeCache('u1', { v: 1, program })).not.toThrow()
    expect(() => clearCache('u1')).not.toThrow()
  })

  it('no account id is inert', () => {
    writeCache(undefined, { v: 3, program })
    expect(readCache(undefined)).toBeNull()
    expect(localStorage.length).toBe(0)
  })
})
