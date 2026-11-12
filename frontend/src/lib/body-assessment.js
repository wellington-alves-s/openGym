// The body assessment of one date: skinfold body fat, body composition and ideal weight, plus
// what is missing to work them out. Pure: kg and cm out, today is a parameter.
import { ageAt, normalizeSex } from './body-profile.js'
import { bodyFatOf, JP7_KEYS, jp3Keys, skinfoldSum } from './body-fat.js'
import { simpleComposition, advancedComposition } from './body-composition.js'
import { idealWeightRange } from './ideal-weight.js'
import { ADVANCED_MEASUREMENT_KEYS, measurementValue } from './measurements.js'
import { normalizeHeightCm } from './bmi.js'

const LB_PER_KG = 2.2046226218
const entries = S => (Array.isArray(S?.measurements) ? S.measurements : []).filter(e => typeof e?.d === 'string')

// The advanced readings of the entry of `d`, validated; null for each one that is empty.
function readingsOf(S, d) {
  const e = entries(S).find(x => x.d === d)
  return Object.fromEntries(ADVANCED_MEASUREMENT_KEYS.map(k => [k, measurementValue(e, k)]))
}

// The weigh-in of `d`, else the newest before it (never a later one), in kg to one decimal.
function weightKgAt(S, d) {
  let last = null
  for (const b of Array.isArray(S?.bodyweight) ? S.bodyweight : []) {
    if (typeof b?.d === 'string' && b.d <= d && Number(b.w) > 0 && (!last || b.d > last.d)) last = b
  }
  if (!last) return null
  const kg = Math.round((S.unit === 'lb' ? Number(last.w) / LB_PER_KG : Number(last.w)) * 10) / 10
  return Number.isFinite(kg) && kg > 0 ? kg : null
}

/** { d, age, sex, weightKg, fat: { jp7, jp3 }, simple, advanced, ideal, missing } for date `d`. */
export function assessmentOf(S, d) {
  const sex = normalizeSex(S?.sex)
  const age = ageAt(S?.birthDate, d)
  const m = readingsOf(S, d)
  const fat = bodyFatOf(m, { age, sex })
  const weightKg = weightKgAt(S, d)
  const heightCm = normalizeHeightCm(S?.heightCm)
  const pct = fat.jp7 ?? fat.jp3
  const simple = pct === null || weightKg === null ? null : simpleComposition(weightKg, pct)
  const advanced = pct === null || weightKg === null ? null
    : advancedComposition(weightKg, pct, { heightCm, wristCm: m.bnWrist, femurCm: m.bnFemur, sex })
  const ideal = idealWeightRange(S?.heightCm)

  const missing = []
  if (!sex) missing.push('needs-sex')
  if (age === null) missing.push('needs-age')
  else if (age < 18 || age > 61) missing.push('age-out-of-range')
  // Without a sex only the seven-site set can be judged.
  const keys3 = jp3Keys(sex)
  if (skinfoldSum(m, JP7_KEYS) === null && (!keys3 || skinfoldSum(m, keys3) === null)) missing.push('needs-skinfolds')
  if (heightCm === null) missing.push('needs-height')
  if (weightKg === null) missing.push('needs-weight')
  if (pct !== null && (m.bnWrist === null || m.bnFemur === null)) missing.push('needs-bones')

  return { d, age, sex, weightKg, fat, simple, advanced, ideal, missing }
}

/** { d, jp7, jp3 } for each measurement date where at least one protocol computes, by date. */
export function assessmentSeries(S) {
  return entries(S)
    .map(e => ({ d: e.d, ...assessmentOf(S, e.d).fat }))
    .filter(p => p.jp7 !== null || p.jp3 !== null)
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
}

/** The assessment of the newest date with a body fat; else the newest with any skinfold or diameter; else of `today`. */
export function latestAssessment(S, today) {
  const series = assessmentSeries(S)
  if (series.length) return assessmentOf(S, series[series.length - 1].d)
  const withReading = entries(S)
    .filter(e => ADVANCED_MEASUREMENT_KEYS.some(k => measurementValue(e, k) !== null))
    .map(e => e.d).sort()
  return assessmentOf(S, withReading.length ? withReading[withReading.length - 1] : today)
}
