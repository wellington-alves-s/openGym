// One check-in per date on the Body screen: weight, measurements and a note in one save.
import { describe, expect, it } from 'vitest'
import { applyCheckin, checkinOf } from './body-checkin.js'
import { emptyMeasurement } from './measurements.js'
import { isoOf } from './format.js'

const NOW = new Date('2026-11-09T10:00:00').getTime()
const D = '2026-11-05'
const base = (extra = {}) => ({
  unit: 'kg', bodyweight: [], measurements: [], customMeasurements: [], measurementEnabled: ['waist'],
  bodyNotes: {}, dayNotes: {}, ...extra,
})
const entry = (d, values, custom = []) => ({ ...emptyMeasurement(d, custom), t: 1, ...values })
const clone = s => JSON.parse(JSON.stringify(s))
const refuses = (s, input, reason, field) => {
  const before = clone(s)
  const r = applyCheckin(s, input, NOW)
  expect(r).toEqual(field ? { ok: false, reason, field } : { ok: false, reason })
  expect(s).toEqual(before)
}

describe('applyCheckin: weight', () => {
  it('adds a weigh-in on a date without one, rounded and sorted by date', () => {
    const s = base({ bodyweight: [{ d: '2026-11-07', w: 80, t: 1 }] })
    expect(applyCheckin(s, { d: D, weight: 81.26 }, NOW)).toEqual({ ok: true })
    expect(s.bodyweight).toEqual([{ d: D, w: 81.3, t: NOW }, { d: '2026-11-07', w: 80, t: 1 }])
  })

  it('replaces a health weigh-in in lb, drops src, does not convert', () => {
    const s = base({ unit: 'lb', bodyweight: [{ d: D, w: 180, t: 1, src: 'health' }] })
    expect(applyCheckin(s, { d: D, weight: 178.4 }, NOW).ok).toBe(true)
    expect(s.bodyweight).toEqual([{ d: D, w: 178.4, t: NOW }])
  })

  it('weight null leaves the existing weigh-in alone', () => {
    const s = base({ bodyweight: [{ d: D, w: 80, t: 1, src: 'health' }] })
    expect(applyCheckin(s, { d: D, weight: null, measurements: { waist: 85 } }, NOW).ok).toBe(true)
    expect(s.bodyweight).toEqual([{ d: D, w: 80, t: 1, src: 'health' }])
  })

  it('measurements alone create no weigh-in', () => {
    const s = base()
    applyCheckin(s, { d: D, weight: null, measurements: { waist: 85 } }, NOW)
    expect(s.bodyweight).toEqual([])
  })

  it('refuses 0, -3 and non-finite weights, and 800 kg as too heavy', () => {
    refuses(base(), { d: D, weight: 0 }, 'weight-invalid')
    refuses(base(), { d: D, weight: -3 }, 'weight-invalid')
    refuses(base(), { d: D, weight: NaN }, 'weight-invalid')
    refuses(base(), { d: D, weight: 800 }, 'weight-too-heavy')
    expect(applyCheckin(base({ unit: 'lb' }), { d: D, weight: 800 }, NOW).ok).toBe(true)
  })
})

describe('applyCheckin: dates and empty', () => {
  it('refuses bad dates and the future', () => {
    refuses(base(), { d: '2026-13-40', weight: 80 }, 'bad-date')
    refuses(base(), { d: 'abc', weight: 80 }, 'bad-date')
    refuses(base(), { d: '2026-02-30', weight: 80 }, 'bad-date')
    refuses(base(), { d: '2026-11-10', weight: 80 }, 'future-date')
    const tomorrow = isoOf(new Date(Date.now() + 86400000))
    const s = base(), before = clone(s)
    expect(applyCheckin(s, { d: tomorrow, weight: 80 })).toEqual({ ok: false, reason: 'future-date' })
    expect(s).toEqual(before)
  })

  it('an empty form is empty', () => {
    refuses(base(), { d: D, weight: null, measurements: {}, note: '' }, 'empty')
    refuses(base(), { d: D, weight: null }, 'empty')
    refuses(base(), { d: D, weight: null, measurements: { waist: null } }, 'empty')
  })

  it('zeroing the only measurement of a date with nothing else is empty', () => {
    refuses(base(), { d: D, weight: null, measurements: { waist: 0 }, note: '' }, 'empty')
  })

  it('an unknown measurement key is ignored', () => {
    refuses(base(), { d: D, weight: null, measurements: { nope: 5, 'other:ghost': 5 } }, 'empty')
  })
})

describe('applyCheckin: measurements', () => {
  it('stores a reading typed in inches (lb profile) as cm', () => {
    const s = base({ unit: 'lb' })
    applyCheckin(s, { d: D, weight: null, measurements: { waist: 30 } }, NOW)
    expect(s.measurements).toHaveLength(1)
    expect(s.measurements[0].waist).toBe(76.2)
    expect(s.measurements[0].t).toBe(NOW)
  })

  it('writes only the keys given and keeps the rest of the entry', () => {
    const s = base({ measurements: [entry(D, { waist: 80, chest: 100 })] })
    applyCheckin(s, { d: D, weight: null, measurements: { waist: 81.26 } }, NOW)
    expect(s.measurements[0]).toMatchObject({ d: D, waist: 81.3, chest: 100, t: NOW })
  })

  it('refuses body fat over 100 without touching the state', () => {
    const s = base({ measurements: [entry(D, { waist: 80 })], bodyweight: [{ d: D, w: 80, t: 1 }] })
    refuses(s, { d: D, weight: 82, measurements: { waist: 70, bodyFat: 120 }, note: 'x' }, 'percent-range', 'bodyFat')
  })

  it('a 0 % body fat is a reading', () => {
    const s = base()
    expect(applyCheckin(s, { d: D, weight: null, measurements: { bodyFat: 0 } }, NOW).ok).toBe(true)
    expect(s.measurements[0].bodyFat).toBe(0)
  })

  it('zeroing every measurement on a date with a weight removes the measurement entry', () => {
    const s = base({ measurements: [entry(D, { waist: 80, chest: 100 })], bodyweight: [{ d: D, w: 80, t: 1 }] })
    expect(applyCheckin(s, { d: D, weight: null, measurements: { waist: 0, chest: null } }, NOW).ok).toBe(true)
    expect(s.measurements).toEqual([])
    expect(s.bodyweight).toEqual([{ d: D, w: 80, t: 1 }])
  })

  it('a custom other:<id> field in kg (lb profile) stores kg and keeps its unit', () => {
    const custom = [{ id: 'm1', name: 'Muscle', enabled: true, unit: 'kg' }]
    const s = base({ unit: 'lb', customMeasurements: custom })
    expect(applyCheckin(s, { d: D, weight: null, measurements: { 'other:m1': 35.25 } }, NOW).ok).toBe(true)
    expect(s.measurements[0].other).toEqual([{ id: 'm1', name: 'Muscle', value: 35.3, unit: 'kg' }])
  })

  it('a custom percent field over 100 refuses with its key', () => {
    const custom = [{ id: 'p', name: 'Water', enabled: true, unit: '%' }]
    refuses(base({ customMeasurements: custom }), { d: D, weight: null, measurements: { 'other:p': 101 } }, 'percent-range', 'other:p')
  })
})

describe('applyCheckin: skinfolds and bone diameters', () => {
  it('stores mm and cm as typed in an lb profile and reads them back', () => {
    const s = base({ unit: 'lb' })
    expect(applyCheckin(s, { d: D, measurements: { skChest: 18, bnWrist: 5.6 } }, NOW).ok).toBe(true)
    expect(s.measurements[0]).toMatchObject({ skChest: 18, bnWrist: 5.6 })
    expect(checkinOf(s, D).measurements).toEqual({ skChest: 18, bnWrist: 5.6 })
  })

  it('refuses a value outside the range without touching the state', () => {
    const s = base({ measurements: [entry(D, { skChest: 10 })] })
    refuses(s, { d: D, measurements: { skChest: 81 } }, 'range', 'skChest')
    refuses(s, { d: D, measurements: { bnWrist: 1.9 } }, 'range', 'bnWrist')
  })

  it('0 clears a stored value, and on an empty date 0 or null is empty', () => {
    const s = base({ measurements: [entry(D, { skChest: 10, waist: 80 })] })
    expect(applyCheckin(s, { d: D, measurements: { skChest: 0 } }, NOW).ok).toBe(true)
    expect(s.measurements[0]).toMatchObject({ skChest: null, waist: 80 })
    refuses(base(), { d: D, measurements: { skChest: null } }, 'empty')
    refuses(base(), { d: D, measurements: { skChest: 0 } }, 'empty')
  })

  it('touching only a skinfold leaves a waist stored in inches without drift', () => {
    const s = base({ unit: 'lb', measurements: [entry(D, { waist: 80.1 })] })
    expect(applyCheckin(s, { d: D, measurements: { skChest: 12 } }, NOW).ok).toBe(true)
    expect(s.measurements[0]).toMatchObject({ waist: 80.1, skChest: 12 })
  })
})

describe('applyCheckin: note', () => {
  it('writes into bodyNotes, not dayNotes', () => {
    const s = base()
    expect(applyCheckin(s, { d: D, weight: null, note: '  fasted ' }, NOW).ok).toBe(true)
    expect(s.bodyNotes).toEqual({ [D]: { text: 'fasted', _ts: NOW } })
    expect(s.dayNotes).toEqual({})
  })

  it('an empty note on a date with one retires it', () => {
    const s = base({ bodyNotes: { [D]: { text: 'old', _ts: 1 } } })
    expect(applyCheckin(s, { d: D, weight: null, note: '' }, NOW).ok).toBe(true)
    expect(s.bodyNotes).toEqual({ [D]: { _ts: NOW } })
  })

  it('a missing note leaves the existing one alone', () => {
    const s = base({ bodyNotes: { [D]: { text: 'old', _ts: 1 } } })
    applyCheckin(s, { d: D, weight: 80 }, NOW)
    expect(s.bodyNotes).toEqual({ [D]: { text: 'old', _ts: 1 } })
  })

  it('an empty note on a date without one writes nothing', () => {
    const s = base()
    applyCheckin(s, { d: D, weight: 80, note: '' }, NOW)
    expect(s.bodyNotes).toEqual({})
  })
})

describe('checkinOf', () => {
  it('is empty for a date with nothing', () => {
    expect(checkinOf(base(), D)).toEqual({ d: D, weight: null, measurements: {}, note: '' })
  })

  it('reads back what applyCheckin wrote', () => {
    const custom = [{ id: 'm1', name: 'Muscle', enabled: true, unit: 'kg' }]
    const s = base({ unit: 'lb', customMeasurements: custom })
    const input = { d: D, weight: 178.4, measurements: { waist: 30, bodyFat: 18.5, 'other:m1': 35.3 }, note: 'fasted' }
    expect(applyCheckin(s, input, NOW).ok).toBe(true)
    expect(checkinOf(s, D)).toEqual(input)
  })
})
