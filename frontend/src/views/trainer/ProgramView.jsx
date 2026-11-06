// A student's program (spec section 5): the start date and the months, each a plan of its own that
// opens to its routines. Months are added empty, copied from the one before or taken from a model,
// and moved, renamed, resized and deleted here. Every change goes through the draft session
// (lib/draft-session.js), which saves the whole program by itself.
import { useContext, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { fmtDateRange, routineCount, uid } from '../../lib/format.js'
import { addDays } from '../../lib/program.js'
import { DraftSessionContext } from '../../lib/draft-session.js'
import { useWorkspaceStore } from '../../lib/workspace.js'
import { tappable } from '../../lib/use-sheet-keyboard.js'
import { confirmSheet } from '../../sheets.jsx'
import { Button } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import ModelPickerSheet from '../../components/ModelPickerSheet.jsx'
import SaveModelSheet from '../../components/SaveModelSheet.jsx'

const MAX_PHASES = 24   // api/rx.js RX_LIMITS.phases
export const monthName = (ph, i) => ph.name || t('Month {0}', i + 1)
const validWeeks = v => /^\d+$/.test(v) && +v >= 1 && +v <= 52

export default function ProgramView() {
  const { sid } = useParams()
  const nav = useNavigate()
  const session = useContext(DraftSessionContext)
  const program = useSyncExternalStore(session.watch, () => session.program)
  const openId = useSyncExternalStore(session.watch, () => session.phaseId)
  const openS = useWorkspaceStore()(s => s.S)   // the open month's edits may not be in the program yet
  const unit = useStore(s => s.S.unit) === 'lb' ? 'lb' : 'kg'
  const { start, phases } = program
  const change = fn => session.updateProgram(fn)
  const full = phases.length >= MAX_PHASES
  // A plan from before months is one open-ended month; a second one needs it to have a length.
  const add = phase => change(p => { p.phases.forEach(ph => { if (!(ph.weeks > 0)) ph.weeks = 4 }); p.phases.push(phase) })
  const newMonth = () => add({ id: uid(), name: '', weeks: 4, bundle: { opengym_plan: 1, unit, week: {}, routines: [], customEx: [] } })
  const duplicate = () => {
    const last = session.current().phases.at(-1)
    add({ id: uid(), name: '', weeks: last.weeks || 4, bundle: structuredClone(last.bundle) })
  }
  // The model's plan keeps its own unit; the month converts it once, when it is opened.
  const useModel = () => useUI.getState().openSheet(close => <ModelPickerSheet close={close}
    onPick={(bundle, name) => add({ id: uid(), name: String(name || '').slice(0, 40), weeks: 4, bundle: structuredClone(bundle) })} />)
  const saveAsModel = (ph, i) => {
    const bundle = session.current().phases.find(x => x.id === ph.id).bundle
    useUI.getState().openSheet(close => <SaveModelSheet bundle={bundle} defaultName={monthName(ph, i)} close={close} />)
  }
  const move = (i, by) => change(p => { const [ph] = p.phases.splice(i, 1); p.phases.splice(i + by, 0, ph) })
  const remove = (ph, i) => confirmSheet({
    title: t('Delete {0}?', monthName(ph, i)), confirmText: t('Delete month'), danger: true,
    onConfirm: () => change(p => { p.phases = p.phases.filter(x => x.id !== ph.id) }),
  })
  const edit = (id, fn) => change(p => { fn(p.phases.find(x => x.id === id)) })
  const setStart = v => { if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) change(p => { p.start = v || null }) }

  const openEnded = phases.length === 1 && !(phases[0].weeks > 0)
  let week = 0   // weeks before the month in the loop below
  return <div className="narrow">
    <div className="row between" style={{ margin: '8px 0 16px', gap: 8 }}>
      <button className="iconbtn" data-back={'/students/' + sid} onClick={() => nav('/students/' + sid)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <h2 className="grow" style={{ margin: 0 }}>{t('Plan')}</h2>
    </div>
    <div className="card">
      <label className="small dim" htmlFor="program-start">{t('Start date')}</label>
      <input id="program-start" className="input" type="date" value={start || ''} onChange={e => setStart(e.target.value)} style={{ marginTop: 6 }} />
      {!start && phases.length > 1 && <div className="small" style={{ marginTop: 6 }}>{t('Pick a start date')}</div>}
    </div>
    <div className="row" style={{ margin: '12px 0', gap: 8, flexWrap: 'wrap' }}>
      <Button size="sm" variant="tinted" icon="plus" disabled={full} onClick={newMonth}>{t('New month')}</Button>
      <Button size="sm" icon="copy" disabled={full} onClick={duplicate}>{t('Duplicate previous month')}</Button>
      <Button size="sm" icon="folder" disabled={full} onClick={useModel}>{t('Use a model')}</Button>
    </div>
    <ul className="card months" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {phases.map((ph, i) => {
        const from = start && !openEnded ? addDays(start, 7 * week) : null
        week += ph.weeks
        const when = openEnded ? t('Open-ended') : from ? fmtDateRange(from, addDays(from, 7 * ph.weeks - 1)) : null
        const routines = ph.id === openId ? openS.routines.length : ph.bundle.routines.length
        const name = monthName(ph, i)
        return <li key={ph.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--separator, rgba(128,128,128,.2))' : 'none' }}>
          <div className="row" style={{ gap: 6 }}>
            <div className="grow" {...tappable(() => nav('/students/' + sid + '/plan/' + ph.id))}>
              <div className="tt">{name}</div>
              <div className="small dim">{[when, routineCount(routines)].filter(Boolean).join(' · ')}</div>
            </div>
            <button className="iconbtn" aria-label={t('Move up')} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronUp" /></button>
            <button className="iconbtn" aria-label={t('Move down')} disabled={i === phases.length - 1} onClick={() => move(i, 1)}><Icon name="chevronDown" /></button>
            {phases.length > 1 && <button className="iconbtn" aria-label={t('Delete {0}', name)} onClick={() => remove(ph, i)}><Icon name="trash" /></button>}
          </div>
          <MonthFields ph={ph} placeholder={t('Month {0}', i + 1)} edit={fn => edit(ph.id, fn)} />
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => saveAsModel(ph, i)}>{t('Save as model')}</Button></div>
        </li>
      })}
    </ul>
  </div>
}

// The name and the length of one month. Weeks typed out of range stay in the field, with the
// reason, until they are fixed or the field is left.
function MonthFields({ ph, placeholder, edit }) {
  const [weeks, setWeeks] = useState(null)   // what is being typed, null when it is what is stored
  const bad = weeks !== null && !validWeeks(weeks)
  const typeWeeks = v => { setWeeks(v); if (validWeeks(v)) edit(x => { x.weeks = +v }) }
  return <>
    <div className="row" style={{ marginTop: 8, gap: 8 }}>
      <input className="input grow" autoComplete="off" maxLength={40} placeholder={placeholder} aria-label={t('Month name')}
        value={ph.name} onChange={e => { const v = e.target.value; edit(x => { x.name = v }) }} />
      <input className="input" type="number" inputMode="numeric" min={1} max={52} step={1} aria-label={t('Weeks')} style={{ width: 80 }}
        aria-invalid={bad || undefined} value={weeks ?? (ph.weeks || '')} onChange={e => typeWeeks(e.target.value)} onBlur={() => setWeeks(null)} />
    </div>
    {bad && <div className="small" role="alert" style={{ marginTop: 6, color: 'var(--danger, #ff453a)' }}>{t('Weeks go from 1 to 52')}</div>}
  </>
}
