import { describe, it, expect } from 'vitest'
import { assessmentOf, assessmentSeries, latestAssessment } from './body-assessment.js'

const D = '2026-11-01'
const FOLDS = { skChest: 20, skMidaxillary: 15, skTriceps: 10, skSubscapular: 15, skAbdominal: 20, skSuprailiac: 10, skThigh: 10 }
const entry = (d, extra = {}) => ({ d, ...FOLDS, bnWrist: 5.6, bnFemur: 9.5, ...extra })
const base = (over = {}) => ({
  unit: 'kg', sex: 'm', birthDate: '1996-03-10', heightCm: 175,
  bodyweight: [{ d: D, w: 80, t: 1 }],
  measurements: [entry(D)],
  ...over,
})

describe('assessmentOf', () => {
  it('joins fat, composition and ideal weight for the date', () => {
    const a = assessmentOf(base(), D)
    expect(a.d).toBe(D)
    expect(a.age).toBe(30)
    expect(a.sex).toBe('m')
    expect(a.fat.jp7).toBeCloseTo(14.6, 1)
    expect(a.fat.jp3).toBeCloseTo(15.1, 1)
    expect(a.weightKg).toBe(80)
    expect(a.simple.fat).toBeCloseTo(11.7, 1)
    expect(a.simple.lean).toBeCloseTo(68.3, 1)
    const { fat, bone, residual, muscle } = a.advanced
    expect(Math.abs(fat + bone + residual + muscle - 80)).toBeLessThanOrEqual(0.1)
    expect(a.ideal).toEqual({ minKg: 56.7, maxKg: 76.3 })
    expect(a.missing).toEqual([])
  })

  it('without sex no protocol computes and it says needs-sex', () => {
    const a = assessmentOf(base({ sex: null }), D)
    expect(a.fat).toEqual({ jp7: null, jp3: null })
    expect(a.simple).toBeNull()
    expect(a.advanced).toBeNull()
    expect(a.missing).toContain('needs-sex')
  })

  it('without a birth date says needs-age', () => {
    const a = assessmentOf(base({ birthDate: null }), D)
    expect(a.age).toBeNull()
    expect(a.missing).toContain('needs-age')
  })

  it('a birth after the date says needs-age', () => {
    expect(assessmentOf(base({ birthDate: '2026-11-02' }), D).missing).toContain('needs-age')
  })

  it.each([['2009-03-10', 17], ['1964-03-10', 62]])('age %s (%i) is out of range and gives no fat', (birthDate, age) => {
    const a = assessmentOf(base({ birthDate }), D)
    expect(a.age).toBe(age)
    expect(a.fat).toEqual({ jp7: null, jp3: null })
    expect(a.missing).toContain('age-out-of-range')
    expect(a.missing).not.toContain('needs-age')
  })

  it('without height says needs-height, no ideal and no advanced, but simple computes', () => {
    const a = assessmentOf(base({ heightCm: null }), D)
    expect(a.missing).toContain('needs-height')
    expect(a.ideal).toBeNull()
    expect(a.advanced).toBeNull()
    expect(a.simple).not.toBeNull()
  })

  it('without any skinfold says needs-skinfolds', () => {
    const a = assessmentOf(base({ measurements: [{ d: D, bnWrist: 5.6, bnFemur: 9.5 }] }), D)
    expect(a.missing).toContain('needs-skinfolds')
    expect(a.missing).not.toContain('needs-bones')
  })

  it('without any weigh-in says needs-weight and simple is null', () => {
    const a = assessmentOf(base({ bodyweight: [] }), D)
    expect(a.weightKg).toBeNull()
    expect(a.missing).toContain('needs-weight')
    expect(a.simple).toBeNull()
  })

  it('without the wrist says needs-bones, advanced is null and simple computes', () => {
    const a = assessmentOf(base({ measurements: [entry(D, { bnWrist: null })] }), D)
    expect(a.missing).toEqual(['needs-bones'])
    expect(a.advanced).toBeNull()
    expect(a.simple).not.toBeNull()
  })

  it('with six of the seven skinfolds jp7 is null and jp3 still computes', () => {
    const a = assessmentOf(base({ measurements: [entry(D, { skMidaxillary: null })] }), D)
    expect(a.fat.jp7).toBeNull()
    expect(a.fat.jp3).toBeCloseTo(15.1, 1)
    expect(a.missing).not.toContain('needs-skinfolds')
    expect(a.simple.fat).toBeCloseTo(80 * a.fat.jp3 / 100, 1)
  })

  it('uses the weigh-in from five days before', () => {
    expect(assessmentOf(base({ bodyweight: [{ d: '2026-10-27', w: 79 }] }), D).weightKg).toBe(79)
  })

  it('never uses a weigh-in from after the date', () => {
    const a = assessmentOf(base({ bodyweight: [{ d: '2026-11-02', w: 81 }, { d: '2026-10-20', w: 78 }] }), D)
    expect(a.weightKg).toBe(78)
    expect(assessmentOf(base({ bodyweight: [{ d: '2026-11-02', w: 81 }] }), D).weightKg).toBeNull()
  })

  it('converts a weigh-in in lb', () => {
    const a = assessmentOf(base({ unit: 'lb', bodyweight: [{ d: D, w: 176.4 }] }), D)
    expect(Math.abs(a.weightKg - 80)).toBeLessThanOrEqual(0.1)
  })

  it('lists what is missing in order, without repeats', () => {
    const a = assessmentOf({ measurements: [] }, D)
    expect(a.missing).toEqual(['needs-sex', 'needs-age', 'needs-skinfolds', 'needs-height', 'needs-weight'])
  })
})

describe('assessmentSeries', () => {
  it('one point per computable date, in date order, skipping dates without a full protocol', () => {
    const S = base({ measurements: [
      entry('2026-11-01'),
      { d: '2026-10-25', skChest: 20 },
      entry('2026-10-01', { skThigh: 12 }),
    ] })
    const s = assessmentSeries(S)
    expect(s.map(p => p.d)).toEqual(['2026-10-01', '2026-11-01'])
    expect(s[1].jp7).toBeCloseTo(14.6, 1)
    expect(s[1].jp3).toBeCloseTo(15.1, 1)
  })
})

describe('latestAssessment', () => {
  it('picks the newer of two computable dates', () => {
    const S = base({ measurements: [entry('2026-11-01'), entry('2026-10-01')] })
    expect(latestAssessment(S, '2026-11-11').d).toBe('2026-11-01')
  })

  it('with only an incomplete entry explains what is missing', () => {
    const S = base({ measurements: [{ d: '2026-10-20', skChest: 20 }] })
    const a = latestAssessment(S, '2026-11-11')
    expect(a.d).toBe('2026-10-20')
    expect(a.missing).toContain('needs-skinfolds')
  })

  it('without any measurement assesses today', () => {
    const a = latestAssessment({ unit: 'kg' }, '2026-11-11')
    expect(a.d).toBe('2026-11-11')
    expect(a.fat).toEqual({ jp7: null, jp3: null })
  })
})
