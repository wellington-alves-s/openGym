import { describe, expect, it } from 'vitest'
import { simpleComposition, rochaBone, advancedComposition } from './body-composition.js'

const D = { heightCm: 175, wristCm: 5.6, femurCm: 9.5, sex: 'm' }
const near = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol + 1e-9)

describe('simpleComposition', () => {
  it('splits weight into fat and lean, one decimal', () => {
    expect(simpleComposition(80, 15)).toEqual({ fat: 12, lean: 68 })
    expect(simpleComposition(80, 0)).toEqual({ fat: 0, lean: 80 })
    expect(simpleComposition(80, 100)).toEqual({ fat: 80, lean: 0 })
  })
  it('is null for a bad weight or percent', () => {
    expect(simpleComposition(0, 15)).toBeNull()
    expect(simpleComposition(80, 101)).toBeNull()
    expect(simpleComposition(80, -1)).toBeNull()
    expect(simpleComposition(NaN, 15)).toBeNull()
    expect(simpleComposition(80, null)).toBeNull()
  })
})

describe('rochaBone', () => {
  it('estimates bone mass in kg', () => {
    near(rochaBone(175, 5.6, 9.5), 11.5, 0.05)
  })
  it('is null for a bad diameter or a height outside 50 to 260', () => {
    expect(rochaBone(175, 0, 9.5)).toBeNull()
    expect(rochaBone(175, 5.6, 0)).toBeNull()
    expect(rochaBone(175, null, 9.5)).toBeNull()
    expect(rochaBone(40, 5.6, 9.5)).toBeNull()
    expect(rochaBone(270, 5.6, 9.5)).toBeNull()
  })
})

describe('advancedComposition', () => {
  it('man: fat, bone, residual (24.1%) and the muscle that is left', () => {
    const r = advancedComposition(80, 14.6, D)
    expect(r.fat).toBe(11.7)
    near(r.bone, 11.5, 0.05)
    expect(r.residual).toBe(19.3)
    near(r.muscle, 37.5, 0.1)
    near(r.fat + r.bone + r.residual + r.muscle, 80, 0.1)
  })
  it('woman: residual is 20.9%', () => {
    const r = advancedComposition(80, 14.6, { ...D, sex: 'f' })
    expect(r.residual).toBe(16.7)
    near(r.fat + r.bone + r.residual + r.muscle, 80, 0.1)
  })
  it('is null without sex, wrist or femur', () => {
    expect(advancedComposition(80, 14.6, { ...D, sex: null })).toBeNull()
    expect(advancedComposition(80, 14.6, { ...D, wristCm: null })).toBeNull()
    expect(advancedComposition(80, 14.6, { ...D, femurCm: undefined })).toBeNull()
    expect(advancedComposition(80, 14.6, { ...D, heightCm: null })).toBeNull()
  })
  it('is null when the muscle would be negative', () => {
    expect(advancedComposition(50, 60, D)).toBeNull()
  })
  it('is null for a bad weight or percent', () => {
    expect(advancedComposition(0, 14.6, D)).toBeNull()
    expect(advancedComposition(80, 101, D)).toBeNull()
  })
})
