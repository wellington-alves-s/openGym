// One check-in per date on the Body screen: the day's weigh-in, its measurements and its note,
// read and saved together. The measurement rules are the ones the old measurement logging sheet
// had; the weigh-in rule is the body-weight sheet's.
import {
  MEASUREMENT_FIELDS, emptyMeasurement, normalizeMeasurementEntry, normalizeMeasurementsState,
  measurementEntryHasValues, measurementUnit, measurementValue, toMeasurementDisplay,
  fromMeasurementDisplay, zeroIsReading,
} from './measurements.js'
import { bodyNoteOf, withBodyNote } from './body-notes.js'
import { bodyWeightMax } from './bodyweight.js'
import { isoOf } from './format.js'

const round = n => Math.round(n * 10) / 10
const realDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && isoOf(new Date(d + 'T12:00:00')) === d

// A custom row shows in its definition's unit, or in the unit it was logged with when the
// definition is gone (an orphaned backup), as the old sheet did.
const customField = (S, item) => {
  const def = (S.customMeasurements || []).find(c => c && c.id === item.id)
  return { key: 'other:' + item.id, custom: true, unit: def?.unit || item.unit }
}

/** What `d` holds: weight in the profile's unit, measurements in display units, the note. */
export function checkinOf(S, d) {
  const bw = (S.bodyweight || []).find(b => b.d === d)
  const entry = (S.measurements || []).find(e => e.d === d)
  const measurements = {}
  for (const f of MEASUREMENT_FIELDS) {
    const v = measurementValue(entry, f.key)
    if (v != null) measurements[f.key] = toMeasurementDisplay(v, S.unit, f)
  }
  for (const o of entry?.other || []) {
    const field = customField(S, o)
    const v = measurementValue(entry, field.key)
    if (v != null) measurements[field.key] = toMeasurementDisplay(v, S.unit, field)
  }
  return { d, weight: bw && Number(bw.w) > 0 ? Number(bw.w) : null, measurements, note: bodyNoteOf(S, d) }
}

/**
 * Save a check-in into `state` (for useStore.update). Everything is checked before anything is
 * written, so a refusal leaves the state as it was. `weight` null leaves the day's weigh-in alone
 * (deleting one is done from the weigh-in list); a missing `note` leaves the note alone, while ''
 * retires an existing one. Returns { ok: true } or { ok: false, reason, field? }.
 */
export function applyCheckin(state, input, now = Date.now()) {
  const { d, weight = null, measurements = {}, note } = input || {}
  if (!realDate(d)) return { ok: false, reason: 'bad-date' }
  if (d > isoOf(new Date(now))) return { ok: false, reason: 'future-date' }

  let w = null
  if (weight != null) {
    w = round(Number(weight))
    if (!Number.isFinite(w) || w <= 0) return { ok: false, reason: 'weight-invalid' }
    if (w > bodyWeightMax(state.unit)) return { ok: false, reason: 'weight-too-heavy' }
  }

  // The entry is rebuilt as a fresh object, so the state is only touched once all keys pass.
  const custom = state.customMeasurements || []
  const old = (state.measurements || []).find(e => e.d === d)
  const entry = old ? normalizeMeasurementEntry(old, custom) : emptyMeasurement(d, custom)
  entry.d = d
  // Only a key that writes a reading or clears one counts: zeroing an empty field saves nothing.
  let touched = false
  for (const [key, raw] of Object.entries(measurements)) {
    const item = key.startsWith('other:') ? entry.other.find(o => o.id === key.slice(6)) : null
    const field = item ? customField(state, item) : MEASUREMENT_FIELDS.find(f => f.key === key)
    if (!field) continue // not a field of this state (built-in or a row of this date): ignored
    const shown = measurementUnit(state.unit, field)
    const value = raw == null || (raw === 0 && !zeroIsReading(shown)) ? null : round(+raw)
    if (shown === '%' && value != null && (value < 0 || value > 100)) return { ok: false, reason: 'percent-range', field: key }
    const before = measurementValue(entry, key)
    if (item) {
      item.value = fromMeasurementDisplay(value, state.unit, field)
      if (field.unit) item.unit = field.unit
    } else if (key === 'bodyFat') entry.bodyFat = value
    else entry[key] = value == null ? null : fromMeasurementDisplay(value, state.unit)
    if (before != null || measurementValue(entry, key) != null) touched = true
  }

  const text = typeof note === 'string' ? note.trim() : ''
  const writeNote = note !== undefined && (text !== '' || bodyNoteOf(state, d) !== '')
  if (w == null && !touched && !writeNote) return { ok: false, reason: 'empty' }

  if (w != null) {
    if (!Array.isArray(state.bodyweight)) state.bodyweight = []
    const ex = state.bodyweight.find(b => b.d === d)
    if (ex) { ex.w = w; ex.t = now; delete ex.src } else state.bodyweight.push({ d, w, t: now })
    state.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
  }
  if (touched) {
    // `t` is when the check-in was last saved: the newer one of a day wins a sync merge.
    entry.t = now
    state.measurements = (state.measurements || []).filter(e => e.d !== d)
    if (measurementEntryHasValues(entry)) state.measurements.push(entry)
    normalizeMeasurementsState(state)
  }
  if (writeNote) state.bodyNotes = withBodyNote(state.bodyNotes, d, text, now)
  return { ok: true }
}
