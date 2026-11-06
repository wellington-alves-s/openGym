// Save as model (the program view): a month's plan kept under a name, to start other months from.
import { useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { createModel } from '../lib/trainer-api.js'
import { Button } from './ui.jsx'

export default function SaveModelSheet({ bundle, defaultName = '', close, onSaved }) {
  const [name, setName] = useState(defaultName.slice(0, 40))
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const submit = async ev => {
    ev.preventDefault()
    if (inFlight.current) return
    const n = name.trim()
    if (!n || n.length > 40) { setErr(t('Enter a name')); return }   // the field stops at 40
    inFlight.current = true; setBusy(true); setErr(null)
    try {
      const { model } = await createModel({ name: n, bundle })
      close()
      useUI.getState().toast(t('Saved as a model'))
      onSaved?.(model)
    } catch (e) {
      setErr(e?.data?.error || e?.message || t('Could not save. Try again.'))
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <form onSubmit={submit} noValidate>
    <h3 style={{ marginBottom: 12 }}>{t('Save as model')}</h3>
    <input className="input" name="name" autoComplete="off" placeholder={t('Model name')} aria-label={t('Model name')} maxLength={40}
      value={name} onChange={e => setName(e.target.value)} />
    {err && <div className="card small" role="alert" style={{ marginTop: 10, color: 'var(--danger, #ff453a)' }}>{err}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" type="submit" aria-disabled={busy}>{t('Save')}</Button>
  </form>
}
