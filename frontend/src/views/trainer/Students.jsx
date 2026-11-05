// The trainer's students: who was invited, who is linked, who left. A new invite link is shown by a
// sheet (components/NewStudentSheet.jsx) and is not kept here.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { fmtDate, isoOf } from '../../lib/format.js'
import { listStudents, newInvite, removeStudent, unlinkStudent } from '../../lib/trainer-api.js'
import { confirmSheet } from '../../sheets.jsx'
import { Button } from '../../components/ui.jsx'
import NewStudentSheet, { InviteLinkSheet } from '../../components/NewStudentSheet.jsx'
import { joinLinkUrl } from '../../lib/student-link.js'

const STATUS = {
  invited: () => t('Invite pending'),
  active: () => t('Active'),
  unlinked: () => t('Unlinked'),
}
const when = s => fmtDate(isoOf(new Date(s.linkedAt || s.created)), false, true)
const say = e => useUI.getState().toast(e?.data?.error || e?.message || t('Could not save. Try again.'))

export default function Students() {
  // null while loading, 'failed' when the list could not be read, else the students.
  const [list, setList] = useState(null)
  const load = useCallback(async () => {
    try { setList(await listStudents()) } catch { setList(prev => (Array.isArray(prev) ? prev : 'failed')) }
  }, [])
  useEffect(() => { load() }, [load])

  // Each action ends with a fresh list, whatever the answer was: the server knows best.
  const run = async fn => {
    try { await fn() } catch (e) { say(e) }
    load()
  }
  const newStudent = () => useUI.getState().openSheet(() => <NewStudentSheet onCreated={load} />)
  // One call per student at a time: a second tap would stack a second sheet and supersede the code.
  const [making, setMaking] = useState(null)
  const inFlight = useRef(null)
  const newLink = async s => {
    if (inFlight.current === s.id) return
    inFlight.current = s.id; setMaking(s.id)
    try {
      await run(async () => {
        const link = joinLinkUrl(await newInvite(s.id))
        useUI.getState().openSheet(() => <InviteLinkSheet link={link} />)
      })
    } finally { inFlight.current = null; setMaking(null) }
  }
  const remove = s => confirmSheet({
    title: t('Remove invite?'), message: t('{0} will not be able to use the link any more.', s.name),
    confirmText: t('Remove invite'), danger: true, onConfirm: () => run(() => removeStudent(s.id)),
  })
  const unlink = s => confirmSheet({
    title: t('Unlink {0}?', s.name), message: t('You will no longer see their workouts. They keep their own account and data.'),
    confirmText: t('Unlink'), danger: true, onConfirm: () => run(() => unlinkStudent(s.id)),
  })

  return <div className="narrow">
    <div className="row between" style={{ margin: '8px 0 16px' }}>
      <h2 style={{ margin: 0 }}>{t('Students')}</h2>
      <Button variant="primary" size="sm" icon="plus" onClick={newStudent}>{t('New student')}</Button>
    </div>
    {list === null ? null
      : list === 'failed' ? <div className="card" role="alert">
        <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load your students. Check your connection and try again.')}</div>
        <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
      </div>
      : !list.length ? <div className="card muted">{t('No students yet. Add your first student to send them an invite link.')}</div>
      : <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={t('Students')}>
        {list.map((s, i) => <li key={s.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--separator, rgba(128,128,128,.2))' : 'none' }}>
          <div className="row between">
            <strong>{s.name}</strong>
            <span className="small dim">{STATUS[s.status]?.() || ''}</span>
          </div>
          <div className="small dim">{when(s)}</div>
          {(s.status === 'invited' || s.status === 'active') && <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {s.status === 'invited' && <>
              <Button size="sm" aria-label={t('New link for {0}', s.name)} disabled={making === s.id} onClick={() => newLink(s)}>{t('New link')}</Button>
              <Button size="sm" aria-label={t('Remove invite for {0}', s.name)} onClick={() => remove(s)}>{t('Remove invite')}</Button>
            </>}
            {s.status === 'active' && <Button size="sm" aria-label={t('Unlink {0}', s.name)} onClick={() => unlink(s)}>{t('Unlink')}</Button>}
          </div>}
        </li>)}
      </ul>}
  </div>
}
