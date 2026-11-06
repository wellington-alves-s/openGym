// One student (spec section 5.1): name and state and, once they joined, the Training card: the
// published version, whether the draft has changes since, and Edit plan, Publish and Versions.
import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { getRx, listStudents } from '../../lib/trainer-api.js'
import { Button } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import PublishSheet from '../../components/PublishSheet.jsx'
import VersionsSheet, { dateOf } from '../../components/VersionsSheet.jsx'
import { whenSaved } from './PrescriptionWorkspace.jsx'
import { STATUS } from './Students.jsx'

// rxView carries no version bundles: a draft saved after the current version was published differs.
const draftChanged = rx => rx.draft.updated > (rx.versions.find(x => x.v === rx.current)?.at || 0)

export default function StudentDetail() {
  const { sid } = useParams()
  const nav = useNavigate()
  // null while loading, 'missing' or 'failed', else { student, rx } (rx only for a student who joined).
  const [data, setData] = useState(null)
  const load = useCallback(async () => {
    try {
      const student = (await listStudents()).find(s => s.id === sid)
      if (!student) { setData('missing'); return }
      // The workspace may still be saving the last change: read the plan once it is in.
      if (student.status === 'active') await whenSaved(sid)
      setData({ student, rx: student.status === 'active' ? (await getRx(sid)).rx : null })
    } catch { setData(prev => (prev && typeof prev === 'object' ? prev : 'failed')) }
  }, [sid])
  useEffect(() => { load() }, [load])

  if (data === null) return null
  if (data === 'missing') return <Navigate to="/students" replace />
  const head = name => <div className="row" style={{ margin: '8px 0 16px', gap: 8 }}>
    <button className="iconbtn" data-back="/students" onClick={() => nav('/students')} aria-label={t('Students')}><Icon name="chevronLeft" /></button>
    {name}
  </div>
  if (data === 'failed') return <div className="narrow">{head(null)}<div className="card" role="alert">
    <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load the plan. Check your connection and try again.')}</div>
    <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
  </div></div>

  const { student, rx } = data
  const current = rx?.versions.find(x => x.v === rx.current)
  const latestRev = async () => { await whenSaved(sid); return rx._rev }
  const publish = () => useUI.getState().openSheet(close => <PublishSheet sid={sid} close={close} onDone={load} latestRev={latestRev}
    empty={!rx.draft.bundle.routines.some(r => r.ex.length)} />)
  const versions = () => useUI.getState().openSheet(close => <VersionsSheet sid={sid} close={close} onDone={load} latestRev={latestRev}
    versions={rx.versions} />)

  return <div className="narrow">
    {head(<div className="grow">
      <h2 style={{ margin: 0 }}>{student.name}</h2>
      <div className="small dim">{STATUS[student.status]?.() || ''}</div>
    </div>)}
    {!rx ? <div className="card muted">{t('This student has not joined yet')}</div>
      : <div className="card">
        <strong>{t('Training')}</strong>
        <div className="small muted" style={{ marginTop: 4 }}>{current ? t('Version {0}, published {1}', current.v, dateOf(current.at)) : t('Not published yet')}</div>
        {draftChanged(rx) && <div className="small" style={{ marginTop: 4 }}>{t('Draft has changes')}</div>}
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <Button size="sm" variant="primary" onClick={() => nav('/students/' + sid + '/plan')}>{t('Edit plan')}</Button>
          <Button size="sm" onClick={publish}>{t('Publish')}</Button>
          <Button size="sm" onClick={versions}>{t('Versions')}</Button>
        </div>
      </div>}
  </div>
}
