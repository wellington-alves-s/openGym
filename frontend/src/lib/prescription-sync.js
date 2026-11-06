// Pulls the trainer's published plan into the student's own plan (spec 6.2). The caller hands in
// the network and the store, so this stays a pure decision: what to do given the two versions.

import { applyPrescription, removePrescription, appliedVersion, isPrescribed } from './prescription.js'

/**
 * 'same' nothing to do | 'applied' new version in | 'removed' prescribed routines gone |
 * 'deferred' a workout is running, try again later | 'offline' could not ask, plan untouched.
 */
export async function syncPrescription({ fetchRev, fetchRx, getS, update, notify }) {
  const hasRx = () => (getS().routines || []).some(isPrescribed)
  const drop = () => {
    if (!hasRx()) return 'same'
    update(S => { removePrescription(S) })
    return 'removed'
  }
  try {
    const { v } = await fetchRev()
    if (v == null) return getS().active && hasRx() ? 'deferred' : drop()
    if (v === appliedVersion(getS())) return 'same'
    if (getS().active) return 'deferred'
    const rx = await fetchRx()
    if (getS().active) return 'deferred'   // a workout may have started during the download
    update(S => { applyPrescription(S, rx.bundle, rx.v) })
    notify(rx.v)
    return 'applied'
  } catch (e) {
    // Only the server saying "not linked" takes the plan away; no answer at all never does.
    if (e?.status === 404) return getS().active && hasRx() ? 'deferred' : drop()
    return 'offline'
  }
}
