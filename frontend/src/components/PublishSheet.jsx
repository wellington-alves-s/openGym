// Publishing a student's draft plan as the next numbered version (StudentDetail's Publish). The
// revision is asked for only once the workspace's last save is in, so it is the newest one.
import { useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { publishRx } from '../lib/trainer-api.js'
import { Button, TextArea } from './ui.jsx'

export const rxErrorText = e => e?.status === 409 ? t('The plan changed somewhere else')
  : e?.data?.code === 'empty-draft' ? t('Add at least one exercise first')
    : e?.data?.error || e?.message || t('Could not save. Try again.')

export default function PublishSheet({ sid, empty, latestRev, onDone, close }) {
  const [note, setNote] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const publish = async () => {
    if (empty) { setErr(t('Add at least one exercise first')); return }
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setErr(null)
    try {
      const { v } = await publishRx(sid, note.trim(), await latestRev())
      close()
      useUI.getState().toast(t('Version {0} published', v))
      onDone?.()
    } catch (e) {
      setErr(rxErrorText(e))
      if (e?.status === 409) onDone?.()   // the screen behind reads the plan again
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <div>
    <h3 style={{ marginBottom: 8 }}>{t('Publish')}</h3>
    <div className="muted small" style={{ marginBottom: 10, lineHeight: 1.5 }}>{t('Your student gets this plan the next time they open the app.')}</div>
    <TextArea placeholder={t('Note (optional)')} aria-label={t('Note (optional)')} maxLength={200} rows={3}
      value={note} onChange={e => setNote(e.target.value)} />
    {err && <div className="card small" role="alert" style={{ marginTop: 10, color: 'var(--danger, #ff453a)' }}>{err}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" aria-disabled={busy} onClick={publish}>{t('Publish')}</Button>
  </div>
}
