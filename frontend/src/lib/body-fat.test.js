import { describe, expect, it } from 'vitest'
import { JP7_KEYS, jp3Keys, skinfoldSum, jacksonPollock7, jacksonPollock3, siri, bodyFatOf } from './body-fat.js'

const SEVEN = { skChest: 20, skMidaxillary: 15, skTriceps: 10, skSubscapular: 15, skAbdominal: 20, skSuprailiac: 10, skThigh: 10 }

describe('key sets', () => {
  it('lists the seven skinfolds and the sex-specific three', () => {
    expect(JP7_KEYS).toEqual(['skChest', 'skMidaxillary', 'skTriceps', 'skSubscapular', 'skAbdominal', 'skSuprailiac', 'skThigh'])
    expect(jp3Keys('m')).toEqual(['skChest', 'skAbdominal', 'skThigh'])
    expect(jp3Keys('f')).toEqual(['skTriceps', 'skSuprailiac', 'skThigh'])
    expect(jp3Keys(null)).toBeNull()
    expect(jp3Keys('x')).toBeNull()
  })
})

describe('skinfoldSum', () => {
  it('adds the keys in mm', () => {
    expect(skinfoldSum(SEVEN, JP7_KEYS)).toBe(100)
  })
  it('is null when a key is missing, not a number, zero or negative', () => {
    const { skThigh, ...rest } = SEVEN
    expect(skinfoldSum(rest, JP7_KEYS)).toBeNull()
    expect(skinfoldSum({ ...SEVEN, skThigh: '10' }, JP7_KEYS)).toBeNull()
    expect(skinfoldSum({ ...SEVEN, skThigh: 0 }, JP7_KEYS)).toBeNull()
    expect(skinfoldSum({ ...SEVEN, skThigh: -4 }, JP7_KEYS)).toBeNull()
    expect(skinfoldSum({ ...SEVEN, skThigh: NaN }, JP7_KEYS)).toBeNull()
    expect(skinfoldSum(null, JP7_KEYS)).toBeNull()
  })
})

describe('Jackson and Pollock density and Siri', () => {
  it('seven skinfolds, man', () => {
    const d = jacksonPollock7(100, 30, 'm')
    expect(d).toBeCloseTo(1.065353, 6)
    expect(Math.abs(siri(d) - 14.6)).toBeLessThan(0.1 + 1e-9)
  })
  it('seven skinfolds, woman', () => {
    const d = jacksonPollock7(100, 30, 'f')
    expect(d).toBeCloseTo(1.051781, 6)
    expect(Math.abs(siri(d) - 20.6)).toBeLessThan(0.1 + 1e-9)
  })
  it('three skinfolds, man', () => {
    const d = jacksonPollock3(60, 30, 'm')
    expect(d).toBeCloseTo(1.057816, 6)
    expect(Math.abs(siri(d) - 18.0)).toBeLessThan(0.1 + 1e-9)
    expect(jacksonPollock3(50, 30, 'm')).toBeCloseTo(1.064323, 6)
    expect(Math.abs(siri(jacksonPollock3(50, 30, 'm')) - 15.1)).toBeLessThan(0.1 + 1e-9)
  })
  it('three skinfolds, woman', () => {
    const d = jacksonPollock3(60, 30, 'f')
    expect(d).toBeCloseTo(1.044022, 6)
    expect(Math.abs(siri(d) - 24.1)).toBeLessThan(0.1 + 1e-9)
  })
  it('null for a bad sex, sum or age', () => {
    expect(jacksonPollock7(100, 30, null)).toBeNull()
    expect(jacksonPollock3(60, 30, 'male')).toBeNull()
    expect(jacksonPollock7('100', 30, 'm')).toBeNull()
    expect(jacksonPollock7(100, NaN, 'm')).toBeNull()
  })
  it('siri is null outside 0 to 70 or not finite', () => {
    expect(siri(0.9)).toBeNull()
    expect(siri(1.2)).toBeNull()
    expect(siri(NaN)).toBeNull()
    expect(siri(Infinity)).toBeNull()
    expect(siri('1.05')).toBeNull()
  })
})

describe('bodyFatOf', () => {
  it('gives both protocols from the full skinfold sets', () => {
    const r = bodyFatOf(SEVEN, { age: 30, sex: 'm' })
    expect(Math.abs(r.jp7 - 14.6)).toBeLessThan(0.1 + 1e-9)
    expect(Math.abs(r.jp3 - 15.1)).toBeLessThan(0.1 + 1e-9)
  })
  it('each protocol needs its whole set', () => {
    const { skMidaxillary, ...six } = SEVEN
    const r = bodyFatOf(six, { age: 30, sex: 'm' })
    expect(r.jp7).toBeNull()
    expect(Math.abs(r.jp3 - 15.1)).toBeLessThan(0.1 + 1e-9)
  })
  it('a zero or negative skinfold in the set gives null', () => {
    expect(bodyFatOf({ ...SEVEN, skChest: 0 }, { age: 30, sex: 'm' })).toEqual({ jp7: null, jp3: null })
    expect(bodyFatOf({ ...SEVEN, skThigh: -1 }, { age: 30, sex: 'm' })).toEqual({ jp7: null, jp3: null })
  })
  it('no sex gives both null', () => {
    expect(bodyFatOf(SEVEN, { age: 30, sex: null })).toEqual({ jp7: null, jp3: null })
  })
  it('age edges: 17 and 62 are out, 18 and 61 calculate', () => {
    expect(bodyFatOf(SEVEN, { age: 17, sex: 'm' })).toEqual({ jp7: null, jp3: null })
    expect(bodyFatOf(SEVEN, { age: 62, sex: 'm' })).toEqual({ jp7: null, jp3: null })
    expect(bodyFatOf(SEVEN, { age: null, sex: 'm' })).toEqual({ jp7: null, jp3: null })
    expect(bodyFatOf(SEVEN, { age: 18, sex: 'm' }).jp7).not.toBeNull()
    expect(bodyFatOf(SEVEN, { age: 61, sex: 'm' }).jp7).not.toBeNull()
  })
})
