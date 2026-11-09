import { describe, expect, it } from 'vitest'
import { HEIGHT_MIN_CM, HEIGHT_MAX_CM, normalizeHeightCm, bmi, bmiBand, bmiOf } from './bmi.js'

describe('bmi', () => {
  it('weight over height squared, one decimal', () => {
    expect(bmi(70, 175)).toBe(22.9)
  })
  it('is null without a usable weight or height', () => {
    expect(bmi(null, 175)).toBeNull()
    expect(bmi(70, null)).toBeNull()
    expect(bmi(0, 175)).toBeNull()
    expect(bmi(70, 0)).toBeNull()
    expect(bmi(70, 10)).toBeNull()
    expect(bmi(70, 300)).toBeNull()
  })
})

describe('bmiBand', () => {
  it('cuts at 18.5, 25 and 30', () => {
    expect([18.4, 18.5, 24.9, 25, 29.9, 30].map(bmiBand)).toEqual(['under', 'normal', 'normal', 'over', 'over', 'obese'])
  })
  it('is null without a value', () => {
    expect(bmiBand(null)).toBeNull()
  })
})

describe('normalizeHeightCm', () => {
  it('rounds to 0.1 inside the range', () => {
    expect(HEIGHT_MIN_CM).toBe(50)
    expect(HEIGHT_MAX_CM).toBe(260)
    expect(normalizeHeightCm(175.55)).toBe(175.6)
    expect(normalizeHeightCm(50)).toBe(50)
    expect(normalizeHeightCm(260)).toBe(260)
  })
  it('is null outside the range or not a number', () => {
    for (const v of [49, 261, 'abc', NaN, null, undefined, Infinity]) expect(normalizeHeightCm(v), String(v)).toBeNull()
  })
})

describe('bmiOf', () => {
  it('converts lb to kg', () => {
    expect(bmiOf({ unit: 'lb', heightCm: 175, bodyweight: [{ d: '2026-10-01', w: 154.3 }] })).toEqual({ value: 22.9, band: 'normal' })
  })
  it('uses the latest weigh-in by date, whatever the stored order, skipping empty ones', () => {
    const S = { unit: 'kg', heightCm: 175, bodyweight: [{ d: '2026-10-03', w: 70 }, { d: '2026-10-01', w: 90 }, { d: '2026-10-05' }, { d: '2026-10-06', w: 0 }] }
    expect(bmiOf(S)).toEqual({ value: 22.9, band: 'normal' })
  })
  it('is null without height or weight', () => {
    expect(bmiOf({ unit: 'kg', bodyweight: [{ d: '2026-10-01', w: 70 }] })).toBeNull()
    expect(bmiOf({ unit: 'kg', heightCm: 175, bodyweight: [] })).toBeNull()
    expect(bmiOf({ unit: 'kg', heightCm: 175 })).toBeNull()
  })
})
