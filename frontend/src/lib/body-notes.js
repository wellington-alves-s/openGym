// The note on a body check-in (the Body screen): "fasted", "after dinner". Stored per day like
// S.dayNotes (lib/day-notes.js), but kept apart from it: a day note excuses the missed-day nudge,
// and this one must not.
//
//   S.bodyNotes = { '2026-10-08': { text: 'fasted', _ts }, … }
//
// Each day is one entry with its last write time, so two devices keep each other's days and the
// same day keeps the later note (lib/sync-merge.js mergeStampedMap). Taking a note away is a
// stamped empty entry (`{ _ts }`), not a deleted key: a delete would come straight back from the
// other device's copy on the next sync.
import { NOTE_MAX } from './history.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

/** The note on `iso`, or '' for none, a removed one or junk. */
export function bodyNoteOf(S, iso) {
  const e = isMap(S?.bodyNotes) ? S.bodyNotes[iso] : null
  return isMap(e) && typeof e.text === 'string' ? e.text.trim().slice(0, NOTE_MAX) : ''
}

/** S.bodyNotes with `iso` set to `text`, stamped `now`. Blank text is a removed entry. */
export function withBodyNote(map, iso, text, now = Date.now()) {
  const t = typeof text === 'string' ? text.trim().slice(0, NOTE_MAX) : ''
  return { ...(isMap(map) ? map : {}), [iso]: t ? { text: t, _ts: now } : { _ts: now } }
}
