// A personal trainer makes their own account: the profile form (components/RegisterProfile.jsx)
// plus an optional phone, sent with as: 'trainer'. The owner approves it, except the first account
// on a new server, which is approved at once and goes straight in.
import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { isPendingTrainer } from '../lib/roles.js'
import { Button } from '../components/ui.jsx'
import RegisterProfile from '../components/RegisterProfile.jsx'
import TrainerPending from './TrainerPending.jsx'

export default function TrainerSignup({ onDone, onBack }) {
  const [phone, setPhone] = useState('')
  const [pending, setPending] = useState(false)
  if (pending) return <TrainerPending />
  const done = u => { if (isPendingTrainer(u)) setPending(true); onDone?.(u) }
  return <>
    <RegisterProfile title={t('Create trainer account')} close={done} extra={{ as: 'trainer', phone: phone.trim() }}>
      <div style={{ height: 10 }} />
      <input className="input" type="tel" name="tel" autoComplete="tel" inputMode="tel" placeholder={t('Phone (optional)')}
        aria-label={t('Phone (optional)')} maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} />
    </RegisterProfile>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={onBack}>{t('Back')}</Button>
  </>
}
