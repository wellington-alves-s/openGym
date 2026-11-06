// A trainer's published plan, applied onto the student's own plan (docs/superpowers/specs, 6.1).
//
// The prescribed routines are told apart by `rx: { v }` and an `rx-` id, so a later version can
// replace them without touching a thing the student made. Pure functions on a store draft.

import { parsePlan } from './plan-share.js'
import { deleteRoutine } from './routines.js'

export const RX_PREFIX = 'rx-'

export const isPrescribed = r => !!r?.rx

/** The highest version among the prescribed routines, 0 when there are none. */
export const appliedVersion = S => Math.max(0, ...(S.routines || []).filter(isPrescribed).map(r => Number(r.rx.v) || 0))

/**
 * Apply plan bundle `bundle` (version `v`) to draft state `S`, in place. Idempotent: the same
 * version twice leaves the same state. Returns how many routines were added and removed, and how
 * many exercises the catalogue did not know (they are left out; the routine stays).
 */
export function applyPrescription(S, bundle, v) {
  const parsed = parsePlan(bundle, S.unit === 'lb' ? 'lb' : 'kg')
  const incoming = parsed.routines.map(r => ({ ...r, id: RX_PREFIX + r.id, rx: { v }, excludeFromProgression: true }))
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
    const ids = [...new Set([].concat(val).map(id => RX_PREFIX + id))].filter(id => keep.has(id))
    if (ids.length) S.week[d] = [...[].concat(S.week[d] || []), ...ids]
  })
  return { added, removed: gone.length, dropped: parsed.dropped }
}

/** Delete every prescribed routine (and its place in the week); returns how many. */
export function removePrescription(S) {
  const ids = S.routines.filter(isPrescribed).map(r => r.id)
  ids.forEach(id => deleteRoutine(S, id))
  return ids.length
}
