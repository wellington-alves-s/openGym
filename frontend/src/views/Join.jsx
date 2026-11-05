// A student opens the link their trainer sent (?join=CODE, lib/student-link.js). The server says who
// invited them; they choose what else the trainer may see, a name and a way to sign in, and the
// account is made. The server answers a wrong, used and expired code alike, and so does this
// screen: one message, no form. The code itself is never shown.
import { useState, useEffect } from 'react'
import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyError, bio } from '../lib/api.js'
import { joinInfo, joinWithPassword, joinWithPasskey } from '../lib/trainer-api.js'
import { stripJoinFromUrl } from '../lib/student-link.js'
import { t } from '../lib/i18n.js'
import { Button, Segmented, Switch } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { MIN_PASSWORD, passwordOn, passwordError } from '../components/PasswordAuth.jsx'

const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh' }
const length = s => [...String(s || '')].length

export default function Join({ code }) {
  const config = useStore(s => s.config)
  // null while loading; 'gone' when the server says the invite is no good (404); 'failed' when it
  // could not be asked (network, 5xx...), which the person may try again.
  const [info, setInfo] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState('')
  const [consent, setConsent] = useState({ measures: false, photos: false, diet: false })
  // The password only where the instance takes them; the passkey first where both work.
  const pwOn = passwordOn(config)
  const passkeyOn = webauthnOK()
  const [how, setHow] = useState(passkeyOn ? 'passkey' : 'password')
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let live = true
    joinInfo(code).then(i => {
      if (!i?.trainerName) throw new Error('bad answer')
      if (live) { setInfo(i); setName(i.studentName || '') }
    }).catch(e => { if (live) setInfo(e?.status === 404 ? 'gone' : 'failed') })
    return () => { live = false }
  }, [code, attempt])

  if (info === null) return <div style={{ ...wrap, alignItems: 'center', fontSize: 34, color: 'var(--label-3)' }}><Icon name="dumbbell" /></div>
  if (info === 'failed') return <div className="narrow" style={{ ...wrap, textAlign: 'center' }}>
    <div className="card small muted" role="alert">{t('Could not reach the server. Check your connection and try again.')}</div>
    <div style={{ height: 12 }} />
    <Button onClick={() => { setInfo(null); setAttempt(a => a + 1) }}>{t('Try again')}</Button>
  </div>
  if (info === 'gone') return <div className="narrow" style={{ ...wrap, textAlign: 'center' }}>
    <div className="card small muted" role="alert">{t('This invite is no longer valid. Ask your trainer for a new one.')}</div>
  </div>

  const passwordWay = pwOn && how === 'password'
  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    const n = name.trim()
    const bad = !n ? t('Enter a name')
      : passwordWay && length(pw) < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
      : passwordWay && pw !== again ? t('The two passwords are not the same.')
      : null
    if (bad) { setErr(bad); return }
    setBusy(true); setErr(null)
    try {
      const u = passwordWay ? await joinWithPassword(code, { name: n, password: pw, consent }) : await joinWithPasskey(code, { name: n, consent })
      stripJoinFromUrl()
      const st = useStore.getState()
      st.setUser(u)
      if (hasData(st.S)) await st.pushState()
      else await st.pullState()
      useUI.getState().toast(t('Welcome, {0}', u.name))
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'AbortError') return
      // Spent or expired between loading and submitting: the same answer as for a dead link.
      if (e?.status === 404) { setInfo('gone'); return }
      setErr(e?.data?.code === 'name-taken' ? t('That name is already taken. Pick another one.')
        : !passwordWay && e?.status !== 429 ? passkeyError(e, t('Registration failed')) : passwordError(e))
    } finally { setBusy(false) }
  }

  return <div className="narrow" style={{ paddingTop: 24 }}>
    <h3>{t('{0} will see your workouts', info.trainerName)}</h3>
    <div className="card">
      <div className="row between small" style={{ marginBottom: 10 }}>
        <span>{t('Workouts')}</span><span className="dim">{t('Always on')}</span>
      </div>
      <div className="dim small" style={{ marginBottom: 8 }}>{t('You can also share')}</div>
      {[['measures', t('Body measurements')], ['photos', t('Progress photos')], ['diet', t('Diet')]].map(([key, label]) => <div key={key} className="row between" style={{ margin: '8px 0' }}>
        <span>{label}</span>
        <Switch aria-label={label} checked={consent[key]} onChange={v => setConsent(c => ({ ...c, [key]: v }))} />
      </div>)}
    </div>
    <div style={{ height: 14 }} />
    {pwOn && passkeyOn && <>
      <Segmented options={[{ value: 'passkey', label: t('Passkey'), icon: 'fingerprint' }, { value: 'password', label: t('Password'), icon: 'key' }]}
        value={how} onChange={setHow} />
      <div style={{ height: 12 }} />
    </>}
    <form onSubmit={submit} noValidate>
      <input className="input" name="username" autoComplete="username" placeholder={t('Your name')} aria-label={t('Your name')} maxLength={40}
        value={name} onChange={e => setName(e.target.value)} />
      {passwordWay ? <>
        <div style={{ height: 10 }} />
        <input className="input" type="password" name="new-password" autoComplete="new-password" placeholder={t('Password')}
          value={pw} onChange={e => setPw(e.target.value)} />
        <div style={{ height: 10 }} />
        <input className="input" type="password" name="new-password-again" autoComplete="new-password" placeholder={t('Repeat the password')}
          value={again} onChange={e => setAgain(e.target.value)} />
        <div className="dim small" style={{ marginTop: 6 }}>{t('At least {0} characters. A few unrelated words make a good one.', MIN_PASSWORD)}</div>
      </> : <div className="muted small" style={{ marginTop: 10 }}>{t('Pick a name, then confirm with {0}. The passkey lives on your device, so no password needed.', bio())}</div>}
      {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
      <div style={{ height: 12 }} />
      <Button type="submit" variant="primary" disabled={busy}>{passwordWay ? t('Create profile') : t('Create passkey')}</Button>
    </form>
  </div>
}
