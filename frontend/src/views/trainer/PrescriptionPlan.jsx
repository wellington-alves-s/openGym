// The routines of a student's draft plan (spec section 5.1), kept lean: make one, delete one, put it
// on weekdays, and a tap opens it in the routine editor. Reads and writes the workspace store
// PrescriptionWorkspace provides, never the trainer's own plan.
import { useNavigate, useParams } from 'react-router-dom'
import { t } from '../../lib/i18n.js'
import { DAYN, DAYS, uid, weekOrder, weekStartOf, exCount } from '../../lib/format.js'
import { useWorkspaceStore } from '../../lib/workspace.js'
import { deleteRoutine } from '../../lib/routines.js'
import { glyphOf, DEFAULT_GLYPH } from '../../lib/glyphs.js'
import { tappable } from '../../lib/use-sheet-keyboard.js'
import { confirmSheet } from '../../sheets.jsx'
import { Button } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'

export default function PrescriptionPlan() {
  const { sid } = useParams()
  const nav = useNavigate()
  const store = useWorkspaceStore()
  const S = store(s => s.S)
  const update = store(s => s.update)
  const open = id => nav('/students/' + sid + '/plan/' + id)

  const add = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    open(r.id)
  }
  const remove = r => confirmSheet({
    title: t('Delete {0}?', r.name), confirmText: t('Delete routine'), danger: true,
    onConfirm: () => update(s => { deleteRoutine(s, r.id) }),
  })
  // A weekday holds one id or a list; a day left with none is dropped.
  const onDay = (id, d) => [].concat(S.week[d] || []).includes(id)
  const toggleDay = (id, d) => update(s => {
    const ids = [].concat(s.week[d] || [])
    const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    if (next.length) s.week[d] = next; else delete s.week[d]
  })
  const days = weekOrder(weekStartOf(S))

  return <div className="narrow">
    <div className="row between" style={{ margin: '8px 0 16px', gap: 8 }}>
      <button className="iconbtn" data-back={'/students/' + sid} onClick={() => nav('/students/' + sid)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <h2 className="grow" style={{ margin: 0 }}>{t('Plan')}</h2>
      <Button size="sm" variant="tinted" icon="plus" onClick={add}>{t('New routine')}</Button>
    </div>
    {!S.routines.length ? <div className="card muted">{t('No routines yet.')}</div>
      : <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {S.routines.map((r, i) => <li key={r.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--separator, rgba(128,128,128,.2))' : 'none' }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="row grow" style={{ gap: 10 }} {...tappable(() => open(r.id))}>
              <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
              <div className="grow"><div className="tt">{r.name}</div><div className="small dim">{exCount(r.ex.length)}</div></div>
            </div>
            <button className="iconbtn" aria-label={t('Delete {0}', r.name)} onClick={() => remove(r)}><Icon name="trash" /></button>
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {days.map(d => <button key={d} className={'chip' + (onDay(r.id, d) ? ' on' : '')} aria-label={t(DAYN[d])}
              aria-pressed={onDay(r.id, d)} onClick={() => toggleDay(r.id, d)}>{t(DAYS[d])}</button>)}
          </div>
        </li>)}
      </ul>}
  </div>
}
