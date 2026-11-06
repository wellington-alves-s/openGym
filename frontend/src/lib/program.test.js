import { describe, it, expect } from 'vitest'
import { programFrom, phaseAt, nextSession, addDays } from './program.js'

const bundle = week => ({ opengym_plan: 1, unit: 'kg', week, routines: [], customEx: [] })
const prog = (start, ...weeks) => ({ start, phases: weeks.map((w, i) => ({ id: 'p' + (i + 1), name: '', weeks: w, bundle: bundle({}) })) })

describe('addDays', () => {
  it('adds and subtracts calendar days across month and year ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  // The arithmetic is on UTC noon, so a zone's clock change never moves the day. Changing process.env.TZ
  // inside a running test is unreliable, so the property is pinned on the New York change dates instead.
  it('counts exactly one day over the spring and autumn clock changes', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDays('2026-03-09', -1)).toBe('2026-03-08')
    expect(addDays('2026-11-02', -1)).toBe('2026-11-01')
  })

  it('a 28-day span across the change lands on the expected date', () => {
    expect(addDays('2026-10-26', 28)).toBe('2026-11-23')
    expect(addDays('2026-03-02', 28)).toBe('2026-03-30')
    expect(addDays('2026-03-02', 365)).toBe('2027-03-02')
  })
})

describe('phaseAt', () => {
  const p = prog('2026-03-02', 4, 2)

  it('is before the start date, on phase 0', () => {
    const r = phaseAt(p, '2026-03-01')
    expect(r.state).toBe('before')
    expect(r.index).toBe(0)
    expect(r.progress).toBe(0)
    expect([r.weekInPhase, r.weekInProgram]).toEqual([0, 0])   // the card says the start date, never Week 0
  })

  it('starts on week 1 of phase 0', () => {
    const r = phaseAt(p, '2026-03-02')
    expect(r).toMatchObject({ index: 0, state: 'running', weekInPhase: 1, phaseWeeks: 4, weekInProgram: 1, totalWeeks: 6, progress: 0 })
    expect(r.phase).toBe(p.phases[0])
  })

  it('is on week 4 of phase 0 on its last day', () => {
    expect(phaseAt(p, '2026-03-29')).toMatchObject({ index: 0, weekInPhase: 4, weekInProgram: 4 })
  })

  it('moves to phase 1 on the boundary day', () => {
    expect(phaseAt(p, '2026-03-30')).toMatchObject({ index: 1, state: 'running', weekInPhase: 1, phaseWeeks: 2, weekInProgram: 5 })
  })

  it('is on week 2 of phase 1 on the last day', () => {
    expect(phaseAt(p, '2026-04-12')).toMatchObject({ index: 1, state: 'running', weekInPhase: 2, weekInProgram: 6 })
  })

  it('is after the program the next day, on the last phase with progress 1', () => {
    expect(phaseAt(p, '2026-04-13')).toMatchObject({ index: 1, state: 'after', progress: 1, weekInPhase: 2, weekInProgram: 6 })
  })

  it('measures progress in days over 7 per week', () => {
    expect(phaseAt(p, '2026-03-16').progress).toBeCloseTo(14 / 42, 10)
  })

  it('stays on phase 0 when there is no start date', () => {
    expect(phaseAt(prog(null, 4, 2), '2026-06-01')).toMatchObject({ index: 0, state: 'running', progress: 0, totalWeeks: 0 })
    const three = prog(null, 4, 2, 3)
    for (const day of ['2020-01-01', '2026-06-01', '2040-12-31'])
      expect(phaseAt(three, day)).toMatchObject({ index: 0, state: 'running', weekInPhase: 1, phaseWeeks: 4, weekInProgram: 1, totalWeeks: 0, progress: 0 })
  })

  it('a single phase with 0 weeks never ends', () => {
    const open = prog('2026-03-02', 0)
    expect(phaseAt(open, '2030-01-01')).toMatchObject({ index: 0, state: 'running', progress: 0, totalWeeks: 0 })
    expect(phaseAt(prog(null, 0), '2026-06-01')).toMatchObject({ index: 0, state: 'running', totalWeeks: 0 })
  })

  it('counts a missing weeks value inside a multi-phase program as one week', () => {
    const q = prog('2026-03-02', 0, 2)
    expect(phaseAt(q, '2026-03-08').index).toBe(0)
    expect(phaseAt(q, '2026-03-09')).toMatchObject({ index: 1, weekInProgram: 2, totalWeeks: 3 })
  })

  it('returns null for a program without phases', () => {
    expect(phaseAt({ start: '2026-03-02', phases: [] }, '2026-03-02')).toBeNull()
  })

  it('counts the right days when a clock change falls inside the program', () => {
    const q = prog('2026-10-26', 2, 2)
    expect(phaseAt(q, '2026-11-01')).toMatchObject({ index: 0, weekInPhase: 1 })
    expect(phaseAt(q, '2026-11-02')).toMatchObject({ index: 0, weekInPhase: 2 })
    expect(phaseAt(q, '2026-11-09')).toMatchObject({ index: 1, weekInPhase: 1, weekInProgram: 3 })
    expect(phaseAt(q, '2026-11-22')).toMatchObject({ index: 1, state: 'running', weekInPhase: 2 })
    expect(phaseAt(q, '2026-11-23').state).toBe('after')
  })
})

describe('nextSession', () => {
  // 2026-03-04 is a Wednesday
  const phase = week => ({ id: 'p1', name: '', weeks: 4, bundle: bundle(week) })

  it('returns today when today has routines', () => {
    expect(nextSession(phase({ 1: 'a', 3: ['b', 'c'] }), '2026-03-04')).toEqual({ date: '2026-03-04', routineIds: ['rx-b', 'rx-c'] })
  })

  it('returns next Monday when only Monday trains', () => {
    expect(nextSession(phase({ 1: 'a' }), '2026-03-04')).toEqual({ date: '2026-03-09', routineIds: ['rx-a'] })
  })

  it('returns null without days', () => {
    expect(nextSession(phase({}), '2026-03-04')).toBeNull()
    expect(nextSession(phase({ 2: [] }), '2026-03-04')).toBeNull()
    expect(nextSession({ bundle: {} }, '2026-03-04')).toBeNull()
  })

  it('wraps over the week end', () => {
    expect(nextSession(phase({ 0: 'z' }), '2026-03-04')).toEqual({ date: '2026-03-08', routineIds: ['rx-z'] })
  })
})

describe('programFrom', () => {
  it('uses rx.program when there is one', () => {
    const program = prog('2026-03-02', 4)
    expect(programFrom({ program, bundle: bundle({}) })).toBe(program)
  })

  it('wraps a bare bundle in one open phase', () => {
    const b = bundle({ 1: 'a' })
    expect(programFrom({ bundle: b })).toEqual({ start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: b }] })
  })

  it('never crashes on an empty rx', () => {
    const r = programFrom({})
    expect(r.phases).toHaveLength(1)
    expect(r.phases[0].bundle).toEqual(bundle({}))
    expect(programFrom(null).phases).toHaveLength(1)
  })
})
