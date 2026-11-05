// The trainer's two invite sheets. NewStudentSheet takes the student's details and, once the server
// has made the record, becomes the invite link; InviteLinkSheet is the same link for "New link" on
// a student already listed. The link (it holds the one-time code) lives in this sheet's state only:
// closed, it is gone, and it is never written anywhere or logged.
import { useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { createStudent } from '../lib/trainer-api.js'
import { joinLinkUrl } from '../lib/student-link.js'
import { copyText } from '../lib/clipboard.js'
import { Button } from './ui.jsx'

export const inviteMessage = link => t('Hi! Here is your invite to train with me on openGym: {0}', link)

export function InviteLinkSheet({ link }) {
  const copy = async () => {
    const ok = await copyText(link)
    useUI.getState().toast(ok ? t('Link copied') : t('Could not copy. Select the link and copy it.'))
  }
  const whatsapp = () => window.open('https://wa.me/?text=' + encodeURIComponent(inviteMessage(link)), '_blank', 'noopener')
  return <div>
    <h3 style={{ marginBottom: 8 }}>{t('Invite link')}</h3>
    <div className="muted small" style={{ marginBottom: 10, lineHeight: 1.5 }}>{t('Send this link to your student. It works once and expires in 7 days. It will not be shown again.')}</div>
    <div className="card small" style={{ wordBreak: 'break-all', userSelect: 'all' }}>{link}</div>
    <div style={{ height: 12 }} />
    <Button variant="primary" icon="share" onClick={copy}>{t('Copy link')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={whatsapp}>{t('Send on WhatsApp')}</Button>
  </div>
}

export default function NewStudentSheet({ onCreated }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)   // the state lags a quick second submit; the ref does not
  const [err, setErr] = useState(null)
  const [link, setLink] = useState(null)
  if (link) return <InviteLinkSheet link={link} />

  const submit = async ev => {
    ev.preventDefault()
    if (inFlight.current) return
    const n = name.trim()
    if (!n) { setErr(t('Enter a name')); return }
    inFlight.current = true; setBusy(true); setErr(null)
    try {
      const { code } = await createStudent({ name: n, phone: phone.trim(), email: email.trim() })
      setLink(joinLinkUrl(code))
      onCreated?.()
    } catch (e) {
      setErr(e?.data?.error || e?.message || t('Could not save. Try again.'))
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <form onSubmit={submit} noValidate>
    <h3 style={{ marginBottom: 12 }}>{t('New student')}</h3>
    <input className="input" name="name" autoComplete="off" placeholder={t('Student name')} aria-label={t('Student name')} maxLength={40}
      value={name} onChange={e => setName(e.target.value)} />
    <div style={{ height: 10 }} />
    <input className="input" type="tel" name="tel" autoComplete="off" inputMode="tel" placeholder={t('Phone (optional)')}
      aria-label={t('Phone (optional)')} maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} />
    <div style={{ height: 10 }} />
    <input className="input" type="email" name="email" autoComplete="off" inputMode="email" placeholder={t('E-mail (optional)')}
      aria-label={t('E-mail (optional)')} maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
    {err && <div className="card small" role="alert" style={{ marginTop: 10, color: 'var(--danger, #ff453a)' }}>{err}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" type="submit" aria-disabled={busy}>{t('Create invite')}</Button>
  </form>
}
