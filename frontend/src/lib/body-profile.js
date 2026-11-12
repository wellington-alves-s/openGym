// Sex and birth date from the profile (S.sex, S.birthDate). Not S.body, which only picks the
// silhouette of the muscle map. The body-fat formulas need both.
import { isoOf } from './format.js'

const realDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && isoOf(new Date(d + 'T12:00:00')) === d

/** 'm' or 'f'; null for anything else. */
export const normalizeSex = v => (v === 'm' || v === 'f' ? v : null)

/** A real YYYY-MM-DD, from 1900 on and not after today; null for anything else. */
export function normalizeBirthDate(v, now = Date.now()) {
  return realDate(v) && v >= '1900-01-01' && v <= isoOf(new Date(now)) ? v : null
}

/** Whole years on day `d` (YYYY-MM-DD); null when either date is not real or the birth is after `d`. */
export function ageAt(birthDate, d) {
  if (!realDate(birthDate) || !realDate(d) || birthDate > d) return null
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [y, m, day] = d.split('-').map(Number)
  return y - by - (m < bm || (m === bm && day < bd) ? 1 : 0)
}
