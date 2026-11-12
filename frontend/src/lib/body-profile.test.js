import { describe, expect, it } from 'vitest'
import { normalizeSex, normalizeBirthDate, ageAt } from './body-profile.js'

const NOW = new Date('2026-05-20T10:00:00').getTime()

describe('normalizeSex', () => {
  it('keeps m and f', () => {
    expect(normalizeSex('m')).toBe('m')
    expect(normalizeSex('f')).toBe('f')
  })
  it('is null for anything else', () => {
    for (const v of ['x', '', null, undefined, 1, 'male']) expect(normalizeSex(v)).toBeNull()
  })
})

describe('normalizeBirthDate', () => {
  it('keeps a real date, today included', () => {
    expect(normalizeBirthDate('1990-05-20', NOW)).toBe('1990-05-20')
    expect(normalizeBirthDate('2026-05-20', NOW)).toBe('2026-05-20')
    expect(normalizeBirthDate('1900-01-01', NOW)).toBe('1900-01-01')
  })
  it('is null for a made-up, old, future or malformed date', () => {
    for (const v of ['1990-02-30', '1899-12-31', '2999-01-01', '2026-05-21', '', null, undefined, '20/05/1990', 19900520]) {
      expect(normalizeBirthDate(v, NOW)).toBeNull()
    }
  })
})

describe('ageAt', () => {
  it('counts whole years on the day', () => {
    expect(ageAt('1990-05-20', '2026-05-19')).toBe(35)
    expect(ageAt('1990-05-20', '2026-05-20')).toBe(36)
    expect(ageAt('1990-05-20', '1990-05-20')).toBe(0)
  })
  it('is null for a birth after the day, or a bad input', () => {
    expect(ageAt('1990-05-20', '1990-05-19')).toBeNull()
    expect(ageAt(null, '2026-05-20')).toBeNull()
    expect(ageAt('1990-05-20', 'x')).toBeNull()
    expect(ageAt('1990-02-30', '2026-05-20')).toBeNull()
  })
  it('a 29 February birthday turns a year old on 1 March in common years', () => {
    expect(ageAt('2000-02-29', '2001-02-28')).toBe(0)
    expect(ageAt('2000-02-29', '2001-03-01')).toBe(1)
  })
})
