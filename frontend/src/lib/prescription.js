// A trainer's published plan, applied onto the student's own plan (docs/superpowers/specs, 6.1).
//
// The prescribed routines are told apart by `rx: { v }` and an `rx-` id, so a later version can
// replace them without touching a thing the student made. Pure functions on a store draft.

import { parsePlan } from './plan-share.js'
import { deleteRoutine } from './routines.js'
import { NOTE_MAX } from './history.js'
import { MAX_TRIPLE_SETS } from './progression.js'

export const RX_PREFIX = 'rx-'
const NAME_MAX = 60
const MAX_SETS = 20
const NUMBERS = ['reps', 'repsMin', 'repsMax', 'sec', 'min', 'weight', 'restSec']
const whole = (v, max) => Math.min(max, Math.max(1, Math.round(Number(v)) || 1))

// The trainer's numbers reach the student's workout screen: a `sets: 1e9` would hang it on a
// routine the student cannot edit. Sync stamps from the bundle would outrank every later edit.
function cleanEx({ _f, _ts, _u, ...e }) {
  if ('sets' in e) e.sets = whole(e.sets, MAX_SETS)
  if ('setsMax' in e) e.setsMax = whole(e.setsMax, MAX_TRIPLE_SETS)
  NUMBERS.forEach(k => {
    if (!(k in e)) return
    const n = Number(e[k])
    if (Number.isFinite(n)) e[k] = Math.max(0, n); else delete e[k]
  })
  if ('note' in e) e.note = String(e.note).slice(0, NOTE_MAX)
  return e
}
function cleanRoutine({ _f, _ts, _u, ...r }) {
  return { ...r, ...(r.name != null ? { name: String(r.name).slice(0, NAME_MAX) } : {}), ex: r.ex.map(cleanEx) }
}

export const isPrescribed = r => !!r?.rx

/** The highest version among the prescribed routines, 0 when there are none. */
export const appliedVersion = S => Math.max(0, ...(S.routines || []).filter(isPrescribed).map(r => Number(r.rx.v) || 0))

/** '<version>:<phase id>' of what is applied, '' with nothing prescribed, '<v>:' for a plan the stage 2a app applied. */
export function appliedKey(S) {
  const first = (S.routines || []).find(isPrescribed)
  return first ? `${appliedVersion(S)}:${first.rx.p || ''}` : ''
}

/**
 * Apply plan bundle `bundle` (version `v`, of phase `phaseId` when the plan is a program) to draft state `S`, in place. Idempotent: the same
 * version twice leaves the same state. Returns how many routines were added and removed, and how
 * many exercises the catalogue did not know (they are left out; the routine stays), plus any routine
 * whose id an own routine already holds.
 */
export function applyPrescription(S, bundle, v, phaseId) {
  const parsed = parsePlan(bundle, S.unit === 'lb' ? 'lb' : 'kg')
  // An own routine that happens to carry an `rx-` id is the student's: that one is skipped.
  const own = new Set(S.routines.filter(r => !isPrescribed(r)).map(r => r.id))
  const all = parsed.routines.map(r => ({ ...cleanRoutine(r), id: RX_PREFIX + r.id, rx: phaseId ? { v, p: phaseId } : { v }, excludeFromProgression: true }))
  const incoming = all.filter(r => !own.has(r.id))
  const keep = new Set(incoming.map(r => r.id))

  // What left the plan goes through deleteRoutine, which also cleans week and dayPlan.
  const gone = S.routines.filter(r => isPrescribed(r) && !keep.has(r.id))
  gone.forEach(r => deleteRoutine(S, r.id))

  let added = 0
  incoming.forEach(r => {
    const at = S.routines.findIndex(x => x.id === r.id)
    if (at >= 0) S.routines[at] = r   // in place: no delete-then-add, so sync leaves no tombstone
    else { S.routines.push(r); added++ }
  })

  // Prescribed ids go to the end of each day they are listed on; the student's own ids stay put.
  S.week = S.week || {}
  Object.keys(S.week).forEach(d => {
    const rest = [].concat(S.week[d]).filter(id => !keep.has(id))
    if (rest.length) S.week[d] = rest; else delete S.week[d]
  })
  Object.entries(parsed.week).forEach(([d, val]) => {
    if (!/^[0-6]$/.test(d)) return   // never a `__proto__` or a ninth day
    const ids = [...new Set([].concat(val).map(id => RX_PREFIX + id))].filter(id => keep.has(id))
    if (ids.length) S.week[d] = [...[].concat(S.week[d] || []), ...ids]
  })
  return { added, removed: gone.length, dropped: parsed.dropped + all.length - incoming.length }
}

/** Delete every prescribed routine (and its place in the week); returns how many. */
export function removePrescription(S) {
  const ids = S.routines.filter(isPrescribed).map(r => r.id)
  ids.forEach(id => deleteRoutine(S, id))
  return ids.length
}
