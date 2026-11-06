// The student's program, kept on the device so the month can turn without a network (spec 4.2).
// One copy per account. Never trusted: anything off shape reads as no cache at all.

const key = uid => 'gym_rx_v1:' + uid

/** { v, program } for this account, or null (no cache, bad JSON, wrong shape, storage blocked). */
export function readCache(uid) {
  if (!uid) return null
  try {
    const rec = JSON.parse(localStorage.getItem(key(uid)))
    return typeof rec?.v === 'number' && Number.isFinite(rec.v) && Array.isArray(rec.program?.phases) && rec.program.phases.every(p => typeof p?.id === 'string') ? rec : null
  } catch { return null }
}

export function writeCache(uid, { v, program }) {
  if (!uid) return
  try { localStorage.setItem(key(uid), JSON.stringify({ v, program })) } catch { /* full or blocked: the next sync downloads again */ }
}

export function clearCache(uid) {
  if (!uid) return
  try { localStorage.removeItem(key(uid)) } catch { /* nothing to do */ }
}
