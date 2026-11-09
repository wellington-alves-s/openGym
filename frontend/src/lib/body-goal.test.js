import { describe, expect, it } from 'vitest'
import { goalGap } from './body-goal.js'

describe('goalGap', () => {
  it('losing: positive diff, toward when closer than before', () => {
    expect(goalGap(80, 75, 81)).toEqual({ diff: 5, toward: true })
    expect(goalGap(80, 75, 79)).toEqual({ diff: 5, toward: false })
  })
  it('toward is null without a previous weight', () => {
    expect(goalGap(80, 75)).toEqual({ diff: 5, toward: null })
  })
  it('gaining: negative diff', () => {
    expect(goalGap(60, 70).diff).toBe(-10)
  })
  it('is null without a weight or a goal', () => {
    expect(goalGap(80, null)).toBeNull()
    expect(goalGap(null, 75)).toBeNull()
  })
})
