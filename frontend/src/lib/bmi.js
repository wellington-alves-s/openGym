// BMI from the profile's latest weigh-in and height. Weights are kept in the profile's unit
// (S.unit), height in cm; the body-mass index itself is always worked out in kg and metres.
export const HEIGHT_MIN_CM = 50
export const HEIGHT_MAX_CM = 260
const LB_PER_KG = 2.2046226218

/** A height in cm inside the accepted range, rounded to 0.1; null for anything else. */
export function normalizeHeightCm(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  if (!Number.isFinite(n) || n < HEIGHT_MIN_CM || n > HEIGHT_MAX_CM) return null
  return Math.round(n * 10) / 10
}

/** kg / m^2 with one decimal; null when either side is missing, not positive, or the height is out of range. */
export function bmi(weightKg, heightCm) {
  const w = Number(weightKg), h = normalizeHeightCm(heightCm)
  if (!(w > 0) || h === null) return null
  return Math.round(w / (h / 100) ** 2 * 10) / 10
}

/** WHO bands on a one-decimal value: under, normal, over, obese. */
export function bmiBand(value) {
  if (!(value > 0)) return null
  return value < 18.5 ? 'under' : value < 25 ? 'normal' : value < 30 ? 'over' : 'obese'
}

/** { value, band } from the newest valid weigh-in (by date, not stored order) and S.heightCm; null if either is missing. */
export function bmiOf(S) {
  let last = null
  for (const b of Array.isArray(S?.bodyweight) ? S.bodyweight : []) {
    if (b?.d && Number(b.w) > 0 && (!last || b.d > last.d)) last = b
  }
  if (!last) return null
  const value = bmi(S.unit === 'lb' ? Number(last.w) / LB_PER_KG : Number(last.w), S.heightCm)
  return value === null ? null : { value, band: bmiBand(value) }
}
