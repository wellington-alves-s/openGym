// The note on a body check-in (the Body screen): one per day, stored like S.dayNotes.
import { describe, expect, it } from 'vitest'
import { bodyNoteOf, withBodyNote } from './body-notes.js'
import { NOTE_MAX } from './history.js'

describe('bodyNoteOf', () => {
  it('reads the text, trimmed, and is empty for no map, a cleared entry or junk', () => {
    expect(bodyNoteOf({}, '2026-10-01')).toBe('')
    expect(bodyNoteOf(null, '2026-10-01')).toBe('')
    expect(bodyNoteOf({ bodyNotes: { '2026-10-01': { _ts: 5 } } }, '2026-10-01')).toBe('')
    expect(bodyNoteOf({ bodyNotes: { '2026-10-01': { text: '  oi ', _ts: 5 } } }, '2026-10-01')).toBe('oi')
    expect(bodyNoteOf({ bodyNotes: { '2026-10-01': 'junk' } }, '2026-10-01')).toBe('')
    expect(bodyNoteOf({ bodyNotes: [] }, '2026-10-01')).toBe('')
  })
})

describe('withBodyNote', () => {
  it('returns a new map stamped now and leaves the input alone', () => {
    const map = { '2026-09-30': { text: 'a', _ts: 1 } }
    const next = withBodyNote(map, '2026-10-01', '  fasted ', 77)
    expect(next).toEqual({ '2026-09-30': { text: 'a', _ts: 1 }, '2026-10-01': { text: 'fasted', _ts: 77 } })
    expect(map).toEqual({ '2026-09-30': { text: 'a', _ts: 1 } })
  })
  it('cuts the text at NOTE_MAX and treats a missing map as empty', () => {
    expect(withBodyNote(undefined, '2026-10-01', 'x'.repeat(NOTE_MAX + 50), 3)['2026-10-01'].text).toHaveLength(NOTE_MAX)
  })
  it('writes a blank text as a cleared entry, never a deleted key', () => {
    expect(withBodyNote({ '2026-10-01': { text: 'a', _ts: 1 } }, '2026-10-01', '   ', 9)).toEqual({ '2026-10-01': { _ts: 9 } })
  })
})
