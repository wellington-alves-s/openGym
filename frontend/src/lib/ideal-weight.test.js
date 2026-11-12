import { describe, expect, it } from 'vitest'
import { idealWeightRange } from './ideal-weight.js'

describe('idealWeightRange', () => {
  it('is BMI 18.5 to 24.9 at the height, one decimal', () => {
    expect(idealWeightRange(175)).toEqual({ minKg: 56.7, maxKg: 76.3 })
    expect(idealWeightRange(160)).toEqual({ minKg: 47.4, maxKg: 63.7 })
  })
  it('is null without a valid height', () => {
    expect(idealWeightRange(null)).toBeNull()
    expect(idealWeightRange(undefined)).toBeNull()
    expect(idealWeightRange(10)).toBeNull()
    expect(idealWeightRange(300)).toBeNull()
    expect(idealWeightRange(NaN)).toBeNull()
  })
})
