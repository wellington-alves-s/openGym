// Use a model (the program view): the trainer's models, and the plan of the one they choose handed
// to onPick(bundle, name) as read from the server. The caller makes the month from a copy of it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n.js'
import { exCount, routineCount } from '../lib/format.js'
import { getModel, listModels } from '../lib/trainer-api.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { Button } from './ui.jsx'
import { dateOf } from './VersionsSheet.jsx'

export default function ModelPickerSheet({ onPick, close }) {
  // null while loading, 'failed', else the list.
  const [models, setModels] = useState(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)   // a sheet dismissed while the model loads adds nothing
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const load = useCallback(() => { setModels(null); listModels().then(setModels, () => setModels('failed')) }, [])
  useEffect(() => { load() }, [load])
  const pick = async m => {
    if (busy) return
    setBusy(true)
    try {
      const { model } = await getModel(m.id)
      if (!alive.current) return
      close()
      onPick(model.bundle, model.name)
    } catch { if (alive.current) setModels('failed') } finally { if (alive.current) setBusy(false) }
  }
  return <div>
    <h3 style={{ marginBottom: 12 }}>{t('Use a model')}</h3>
    {models === null ? <div className="muted small">{t('Loading…')}</div>
      : models === 'failed' ? <div className="card" role="alert">
        <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load the models. Check your connection and try again.')}</div>
        <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
      </div>
        : !models.length ? <div className="card muted">{t('No models yet. Save a month as a model to use it here.')}</div>
          : <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {models.map((m, i) => <li key={m.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--separator, rgba(128,128,128,.2))' : 'none' }}>
              <div {...tappable(() => pick(m))} aria-disabled={busy || undefined}>
                <div className="tt">{m.name}</div>
                <div className="small dim">{routineCount(m.routines)} · {exCount(m.exercises)} · {dateOf(m.updated)}</div>
              </div>
            </li>)}
          </ul>}
  </div>
}
