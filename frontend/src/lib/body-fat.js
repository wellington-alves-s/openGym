// Body fat from skinfolds (Jackson and Pollock, Siri). Pure: skinfolds in mm, age in years.
export const JP7_KEYS = ['skChest', 'skMidaxillary', 'skTriceps', 'skSubscapular', 'skAbdominal', 'skSuprailiac', 'skThigh']
const JP3_KEYS = { m: ['skChest', 'skAbdominal', 'skThigh'], f: ['skTriceps', 'skSuprailiac', 'skThigh'] }
const AGE_MIN = 18, AGE_MAX = 61

const num = v => typeof v === 'number' && Number.isFinite(v)

/** The three-skinfold set for a sex; null for anything but 'm' or 'f'. */
export function jp3Keys(sex) {
  return JP3_KEYS[sex] ? [...JP3_KEYS[sex]] : null
}

/** Sum in mm of the keys; null when any is missing, not a number or not above 0. */
export function skinfoldSum(m, keys) {
  let sum = 0
  for (const k of keys) {
    const v = m?.[k]
    if (!num(v) || v <= 0) return null
    sum += v
  }
  return sum
}

function density(sum, age, sex, c) {
  const k = c[sex]
  if (!k || !num(sum) || !num(age)) return null
  const d = k[0] - k[1] * sum + k[2] * sum * sum - k[3] * age
  return Number.isFinite(d) ? d : null
}

/** Body density from the sum of seven skinfolds. */
export function jacksonPollock7(sum, age, sex) {
  return density(sum, age, sex, {
    m: [1.112, 0.00043499, 0.00000055, 0.00028826],
    f: [1.097, 0.00046971, 0.00000056, 0.00012828],
  })
}

/** Body density from the sum of three skinfolds (the set depends on sex, see jp3Keys). */
export function jacksonPollock3(sum, age, sex) {
  return density(sum, age, sex, {
    m: [1.10938, 0.0008267, 0.0000016, 0.0002574],
    f: [1.0994921, 0.0009929, 0.0000023, 0.0001392],
  })
}

/** Body fat % (one decimal) from density; null when not finite or outside 0 to 70. */
export function siri(d) {
  if (!num(d) || d <= 0) return null
  const pct = (4.95 / d - 4.5) * 100
  if (!Number.isFinite(pct) || pct < 0 || pct > 70) return null
  return Math.round(pct * 10) / 10 + 0 // + 0 turns -0 into 0
}

/** { jp7, jp3 } in %, each null unless its own full skinfold set, a valid sex and an age of 18 to 61 are there. */
export function bodyFatOf(m, { age, sex } = {}) {
  const none = { jp7: null, jp3: null }
  const keys3 = jp3Keys(sex)
  if (!keys3 || !num(age) || age < AGE_MIN || age > AGE_MAX) return none
  const s7 = skinfoldSum(m, JP7_KEYS), s3 = skinfoldSum(m, keys3)
  return {
    jp7: s7 === null ? null : siri(jacksonPollock7(s7, age, sex)),
    jp3: s3 === null ? null : siri(jacksonPollock3(s3, age, sex)),
  }
}
