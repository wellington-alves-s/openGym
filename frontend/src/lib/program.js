// Which phase and week of a program a student is in today. Pure: `today` is always a parameter
// ('YYYY-MM-DD', local calendar); day arithmetic runs on UTC noon so a clock change never moves a day.
import { RX_PREFIX } from './prescription.js'

const DAY = 86400000
const utcNoon = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d, 12) }
export const addDays = (iso, n) => new Date(utcNoon(iso) + n * DAY).toISOString().slice(0, 10)
const daysBetween = (from, to) => Math.round((utcNoon(to) - utcNoon(from)) / DAY)

const emptyBundle = () => ({ opengym_plan: 1, unit: 'kg', week: {}, routines: [], customEx: [] })

export function programFrom(rx) {
  if (rx?.program) return rx.program
  return { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: rx?.bundle || emptyBundle() }] }
}

export function phaseAt(program, today) {
  const phases = program?.phases || []
  if (!phases.length) return null
  const open = phases.length === 1 && !(phases[0].weeks > 0) // one phase with no length never ends
  const lens = phases.map(p => (open ? 0 : Math.max(1, p.weeks | 0)))
  const totalWeeks = lens.reduce((a, b) => a + b, 0)
  const at = (index, state, weekInPhase, weekInProgram, progress) =>
    ({ index, phase: phases[index], state, weekInPhase, phaseWeeks: lens[index], weekInProgram, totalWeeks: open || !program.start ? 0 : totalWeeks, progress })
  if (!program.start) return at(0, 'running', 1, 1, 0)
  const d = daysBetween(program.start, today)
  if (d < 0) return at(0, 'before', 0, 0, 0)
  if (open) return at(0, 'running', Math.floor(d / 7) + 1, Math.floor(d / 7) + 1, 0)
  const week = Math.floor(d / 7) // zero-based week of the program
  if (week >= totalWeeks) return at(phases.length - 1, 'after', lens[lens.length - 1], totalWeeks, 1)
  let first = 0
  let i = 0
  while (week >= first + lens[i]) first += lens[i++]
  return at(i, 'running', week - first + 1, week + 1, Math.min(1, d / (7 * totalWeeks)))
}

export function nextSession(phase, today) {
  const map = phase?.bundle?.week || {}
  const dow = new Date(utcNoon(today)).getUTCDay()
  for (let n = 0; n < 7; n++) {
    const ids = [].concat(map[(dow + n) % 7] || [])
    if (ids.length) return { date: addDays(today, n), routineIds: ids.map(id => RX_PREFIX + id) }
  }
  return null
}
