// A student's page for their trainer (Settings → My trainer, only with a trainer): who it is, what
// else they share besides the workouts, and leaving. The three switches save at once; the server
// has the last word, so a refused save puts the switch back.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { fmtDate, isoOf } from '../lib/format.js'
import { myTrainer, setConsent, leaveTrainer } from '../lib/trainer-api.js'
import { confirmSheet } from '../sheets.jsx'
import { Button, Switch } from '../components/ui.jsx'

const say = e => useUI.getState().toast(e?.data?.error || e?.message || t('Could not save. Try again.'))

export default function MyTrainer() {
  const nav = useNavigate()
  // null while loading, 'failed' when it could not be read, else the server's answer.
  const [info, setInfo] = useState(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const load = useCallback(async () => {
    setInfo(null)
    try { setInfo(await myTrainer()) } catch { setInfo('failed') }
  }, [])
  useEffect(() => { load() }, [load])

  if (info === null) return <div className="dim small" role="status">{t('Loading…')}</div>
  if (info === 'failed') return <div className="card" role="alert">
    <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load your trainer. Check your connection and try again.')}</div>
    <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
  </div>
  if (!info.trainer) return <div className="card muted">{t('You are not linked to a trainer.')}</div>

  const { consent } = info
  const flip = async key => {
    if (inFlight.current) return
    inFlight.current = true; setSaving(true)
    const before = consent
    // The server wants all three every time.
    const next = { measures: !!before.measures, photos: !!before.photos, diet: !!before.diet, [key]: !before[key] }
    setInfo(i => ({ ...i, consent: { ...i.consent, ...next } }))
    try { await setConsent(next) } catch (e) {
      setInfo(i => ({ ...i, consent: before }))
      say(e)
    } finally { inFlight.current = false; setSaving(false) }
  }
  const leave = () => confirmSheet({
    title: t('Leave trainer?'), message: t('{0} will no longer see your workouts. You keep your own account and data.', info.trainer.name),
    confirmText: t('Leave trainer'), danger: true,
    onConfirm: async () => {
      try {
        await leaveTrainer()
        // The same /api/me the app boots with: the user no longer has a trainer, so the app stops showing one.
        try {
          const me = await api('/api/me')
          if (me?.user?.id) useStore.getState().setUser(me.user)
        } catch { /* the next sign-in reads it; the unlink itself is done */ }
        nav('/settings', { replace: true })
      } catch (e) { say(e) }
    },
  })

  return <>
    <div className="card">
      <div><strong>{info.trainer.name}</strong></div>
      {info.since && <div className="small dim">{fmtDate(isoOf(new Date(info.since)), false, true)}</div>}
    </div>
    <p className="small muted">{t('{0} sees your workouts. You choose what else to share.', info.trainer.name)}</p>
    <div className="card">
      <div className="row between small" style={{ marginBottom: 10 }}>
        <span>{t('Workouts')}</span><span className="dim">{t('Always on')}</span>
      </div>
      {[['measures', t('Body measurements')], ['photos', t('Progress photos')], ['diet', t('Diet')]].map(([key, label]) => <div key={key} className="row between" style={{ margin: '8px 0' }}>
        <span>{label}</span>
        <Switch aria-label={label} checked={consent[key]} disabled={saving} onChange={() => flip(key)} />
      </div>)}
    </div>
    <div style={{ height: 14 }} />
    <Button variant="danger" icon="signOut" onClick={leave}>{t('Leave trainer')}</Button>
  </>
}
