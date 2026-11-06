// Pulls the trainer's published plan into the student's own plan (spec 6.2, and 4.2 for programs).
// The caller hands in the network, the store and a cache of the program, so this stays a pure
// decision: what to do given the two versions and today's date.

import { applyPrescription, removePrescription, appliedVersion, appliedKey, isPrescribed } from './prescription.js'
import { programFrom, phaseAt } from './program.js'
import { todayISO } from './format.js'

const NO_CACHE = { read: () => null, write() {}, clear() {} }

/**
 * 'same' nothing to do | 'applied' new version or new month in | 'removed' prescribed routines gone |
 * 'deferred' a workout is running, try again later | 'offline' could not ask, plan untouched.
 *
 * `notify(v)` says a new version came in; `notify(v, { name, index })` says the same version moved
 * on to another phase (`name` may be empty: the caller words it as "Month index+1").
 * With no answer at all from the server, a cached program still turns the month.
 */
export async function syncPrescription({ fetchRev, fetchRx, getS, update, notify, cache = NO_CACHE, today = todayISO }) {
  const hasRx = () => (getS().routines || []).some(isPrescribed)
  const drop = () => {
    cache.clear()
    if (!hasRx()) return 'same'
    update(S => { removePrescription(S) })
    return 'removed'
  }
  const gone = () => (getS().active && hasRx() ? 'deferred' : drop())
  try {
    let rec = cache.read()
    let v
    try {
      ({ v } = await fetchRev())
    } catch (e) {
      // No answer at all (no status): the cached program can still say which month it is.
      if (!rec || e?.status != null || !isNetwork(e)) throw e
      v = rec.v
    }
    if (v === null) return gone()
    if (typeof v !== 'number') return 'offline'   // an answer we cannot read never takes the plan away
    const before = appliedKey(getS())
    if (before === `${v}:`) return 'same'   // applied by the stage 2a app: one phase, nothing to switch
    if (rec?.v !== v) {
      if (getS().active) return 'deferred'
      const rx = await fetchRx()
      if (typeof rx?.v !== 'number' || !(rx.program || rx.bundle)) throw new Error('prescription answer holds no plan')
      rec = { v: rx.v, program: programFrom(rx) }
      cache.write(rec)
      if (getS().active) return 'deferred'   // a workout may have started during the download
    }
    const hit = phaseAt(rec.program, today())
    if (!hit) return 'same'
    const { phase, index } = hit
    if (`${rec.v}:${phase.id}` === before) return 'same'
    if (!phase.bundle?.routines?.length && !before) return 'same'   // nothing to apply, nothing to announce
    if (getS().active) return 'deferred'
    update(S => { applyPrescription(S, phase.bundle, rec.v, phase.id) })
    const [was, wasPhase] = before.split(':')
    if (rec.v !== (Number(was) || 0)) notify(rec.v)
    else if (wasPhase) notify(rec.v, { name: phase.name || '', index })
    return 'applied'
  } catch (e) {
    // Only the server saying "not linked" takes the plan away; no answer at all never does.
    if (e?.status === 404) {
      try { return gone() } catch (e2) { console.warn('prescription sync', e2); return 'offline' }
    }
    if (!isNetwork(e)) console.warn('prescription sync', e)
    return 'offline'
  }
}

// An answer with a status, a timeout (api.js `code`) or a fetch that never reached the server.
const isNetwork = e => e?.status != null || e?.code === 'timeout' || (e instanceof TypeError && /fetch|network|load failed/i.test(e.message))
