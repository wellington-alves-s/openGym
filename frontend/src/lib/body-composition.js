// Body composition in kg from weight, body fat % and (for the advanced split) height and bone diameters in cm.
import { normalizeHeightCm } from './bmi.js'

const r1 = x => Math.round(x * 10) / 10 + 0 // + 0 turns -0 into 0
const pos = v => typeof v === 'number' && Number.isFinite(v) && v > 0
const validInputs = (w, pct) => pos(w) && typeof pct === 'number' && pct >= 0 && pct <= 100

/** { fat, lean } in kg; null for a weight not above 0 or a percent outside 0 to 100. */
export function simpleComposition(weightKg, fatPct) {
  if (!validInputs(weightKg, fatPct)) return null
  const fat = weightKg * fatPct / 100
  return { fat: r1(fat), lean: r1(weightKg - fat) }
}

// Unrounded bone mass (Rocha), H, R and F in metres.
function boneKg(heightCm, wristCm, femurCm) {
  const h = normalizeHeightCm(heightCm)
  if (h === null || !pos(wristCm) || !pos(femurCm)) return null
  const kg = 3.02 * ((h / 100) ** 2 * (wristCm / 100) * (femurCm / 100) * 400) ** 0.712
  return Number.isFinite(kg) ? kg : null
}

/** Bone mass in kg (Rocha), one decimal; null when the height or a diameter is invalid. */
export function rochaBone(heightCm, wristCm, femurCm) {
  const kg = boneKg(heightCm, wristCm, femurCm)
  return kg === null ? null : r1(kg)
}

const WURCH = { m: 0.241, f: 0.209 } // residual mass share of the weight

/** { fat, bone, residual, muscle } in kg (Rocha bone, Wurch residual, muscle is the rest); null if anything is missing or muscle is negative. */
export function advancedComposition(weightKg, fatPct, { heightCm, wristCm, femurCm, sex } = {}) {
  const share = WURCH[sex]
  const bone = boneKg(heightCm, wristCm, femurCm)
  if (!share || bone === null || !validInputs(weightKg, fatPct)) return null
  const fat = weightKg * fatPct / 100, residual = weightKg * share
  const muscle = weightKg - fat - bone - residual
  if (muscle < 0) return null
  return { fat: r1(fat), bone: r1(bone), residual: r1(residual), muscle: r1(muscle) }
}
