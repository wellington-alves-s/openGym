import { normalizeHeightCm } from './bmi.js'

/** Healthy weight range in kg (BMI 18.5 to 24.9) for a height in cm, one decimal; null without a valid height. */
export function idealWeightRange(heightCm) {
  const h = normalizeHeightCm(heightCm)
  if (h === null) return null
  const m2 = (h / 100) ** 2
  return { minKg: Math.round(18.5 * m2 * 10) / 10, maxKg: Math.round(24.9 * m2 * 10) / 10 }
}
