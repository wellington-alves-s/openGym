// The student's program on Home: which month and week, how far along, and the next training day.
// Read from the account's cached program (lib/prescription-cache.js), never from the network.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { fmtDate, todayISO, DAYN } from '../lib/format.js'
import { readCache } from '../lib/prescription-cache.js'
import { appliedKey } from '../lib/prescription.js'
import { programFrom, phaseAt, nextSession } from '../lib/program.js'
import { tappable } from '../lib/use-sheet-keyboard.js'

/** Where this account's program stands today: { program, now } or null (no cache, no phase). */
export function programNow(uid, today = todayISO()) {
  const cache = readCache(uid)
  if (!cache) return null
  const program = programFrom(cache)
  const now = phaseAt(program, today)
  return now ? { program, now } : null
}

/** "Month n of N" ("Month n" when the program has one phase), followed by the phase's name when it has one. */
export const monthLabel = (now, count) => {
  const n = count > 1 ? t('Month {0} of {1}', now.index + 1, count) : t('Month {0}', now.index + 1)
  return now.phase.name ? n + ' · ' + now.phase.name : n
}

function nextLine(now, routines) {
  const next = nextSession(now.phase, todayISO())
  const names = (next?.routineIds || []).map(id => routines.find(r => r.id === id)?.name).filter(Boolean)
  if (!names.length) return null
  const day = next.date === todayISO() ? t('Today') : t(DAYN[new Date(next.date + 'T12:00:00').getDay()])
  const more = names.length > 2 ? ' +' + (names.length - 2) : ''
  return t('Next: {0}, {1}', names.slice(0, 2).join(' + ') + more, day)
}

export default function ProgramCard() {
  const nav = useNavigate()
  const uid = useStore(s => s.user?.id)
  const applied = useStore(s => appliedKey(s.S))
  const routines = useStore(s => s.S?.routines)
  const today = todayISO()
  // The cache is read again only when the account, the applied month or the day changes (a sync writes it, then applies).
  const at = useMemo(() => programNow(uid, today), [uid, applied, today])
  if (!at) return null
  const { program, now } = at
  const lines = []
  let pct = null
  if (now.state === 'before') {
    lines.push(t('Starts on {0}', fmtDate(program.start, false, true)), monthLabel(now, program.phases.length))
  } else if (now.state === 'after') {
    lines.push(t('Program finished')); pct = 100
  } else {
    lines.push(monthLabel(now, program.phases.length))
    if (now.totalWeeks > 0) { lines.push(t('Week {0} of {1}', now.weekInPhase, now.phaseWeeks)); pct = Math.round(now.progress * 100) }
    const next = nextLine(now, routines || [])
    if (next) lines.push(next)
  }
  return <div className="card">
    <div className="prog-card" aria-label={lines.join(', ')} {...tappable(() => nav('/plan'))}>
      <div><strong>{lines[0]}</strong></div>
      {lines.slice(1).map(l => <div key={l} className="small dim">{l}</div>)}
    </div>
    {pct !== null && <div className="prog-bar" role="progressbar" aria-label={t('Program progress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: pct + '%' }} /></div>}
  </div>
}
