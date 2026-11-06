// The trainer's models (spec section 5): reusable plans, each opened in the routine editor
// (ModelWorkspace). Made, renamed and deleted here; a month of a program can be saved as one too.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { t } from '../../lib/i18n.js'
import { exCount, routineCount } from '../../lib/format.js'
import { createModel, deleteModel, getModel, listModels, saveModel } from '../../lib/trainer-api.js'
import { tappable } from '../../lib/use-sheet-keyboard.js'
import { confirmSheet } from '../../sheets.jsx'
import { Button } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import { dateOf } from '../../components/VersionsSheet.jsx'
import { dropSession, sessionOf, watchSessions, whenSaved } from './ModelWorkspace.jsx'

const sayOf = e => (e?.status === 409 ? t('The model changed somewhere else') : e?.data?.error || e?.message || t('Could not save. Try again.'))

// A model's name, for a new model or a rename. onSubmit(name) throws to keep the form open.
function NameForm({ initial = '', onSubmit, onCancel }) {
  const [name, setName] = useState(initial)
  const [err, setErr] = useState(null)
  const busy = useRef(false)
  const submit = async ev => {
    ev.preventDefault()
    if (busy.current) return
    const n = name.trim()
    if (!n) { setErr(t('Enter a name')); return }   // the field stops at 40
    busy.current = true; setErr(null)
    try { await onSubmit(n) } catch (e) { setErr(sayOf(e)) } finally { busy.current = false }
  }
  return <form onSubmit={submit} noValidate>
    <input className="input" name="name" autoComplete="off" autoFocus placeholder={t('Model name')} aria-label={t('Model name')} maxLength={40}
      value={name} onChange={e => setName(e.target.value)} />
    {err && <div className="small" role="alert" style={{ marginTop: 8, color: 'var(--danger, #ff453a)' }}>{err}</div>}
    <div className="row" style={{ marginTop: 10, gap: 8 }}>
      <Button size="sm" variant="primary" type="submit">{t('Save')}</Button>
      <Button size="sm" type="button" onClick={onCancel}>{t('Cancel')}</Button>
    </div>
  </form>
}

export default function Models() {
  const nav = useNavigate()
  const unit = useStore(s => s.S.unit) === 'lb' ? 'lb' : 'kg'
  // null while loading, 'failed' when the list could not be read, else the summaries.
  const [list, setList] = useState(null)
  // 'new', or the id of the model being renamed.
  const [editing, setEditing] = useState(null)
  const heading = useRef(null)
  const load = useCallback(async () => {
    try { setList(await listModels()) } catch { setList(prev => (Array.isArray(prev) ? prev : 'failed')) }
  }, [])
  useEffect(() => { load() }, [load])
  // An editor just left saves on its way out: read the list again once that session is gone.
  useEffect(() => {
    const open = Array.isArray(list) ? list.filter(m => sessionOf(m.id)).map(m => m.id) : []
    if (open.length) return watchSessions(() => { if (open.some(id => !sessionOf(id))) load() })
  }, [list, load])

  const create = async name => {
    const { model } = await createModel({ name, bundle: { opengym_plan: 1, unit, week: {}, routines: [], customEx: [] } })
    nav('/models/' + model.id + '/plan')
  }
  // The summaries carry no _rev: read the model first, and once more if it changed in between.
  // Edits a failed save left in the model's session go up first, or that session would meet a 409.
  const rename = async (m, name) => {
    await whenSaved(m.id)
    const put = async () => saveModel(m.id, { name, _rev: (await getModel(m.id)).model._rev })
    await put().catch(e => (e?.status === 409 ? put() : Promise.reject(e)))
    setEditing(null)
    load()
  }
  const remove = m => confirmSheet({
    title: t('Delete {0}?', m.name), confirmText: t('Delete model'), danger: true,
    onConfirm: async () => {
      try { await deleteModel(m.id); dropSession(m.id) } catch (e) { useUI.getState().toast(sayOf(e)) }
      await load()
      heading.current?.focus()   // the row and its button are gone
    },
  })

  return <div className="narrow">
    <div className="row between" style={{ margin: '8px 0 16px' }}>
      <h2 ref={heading} tabIndex={-1} style={{ margin: 0 }}>{t('Models')}</h2>
      <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing('new')}>{t('New model')}</Button>
    </div>
    {editing === 'new' && <div className="card" style={{ marginBottom: 12 }}>
      <NameForm onSubmit={create} onCancel={() => setEditing(null)} />
    </div>}
    {list === null ? <div className="muted small">{t('Loading…')}</div>
      : list === 'failed' ? <div className="card" role="alert">
        <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load the models. Check your connection and try again.')}</div>
        <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
      </div>
      : !list.length ? <div className="card muted">{t('No models yet. Make one here, or save a month of a program as a model.')}</div>
      : <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={t('Models')}>
        {list.map((m, i) => <li key={m.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--separator, rgba(128,128,128,.2))' : 'none' }}>
          {editing === m.id ? <NameForm initial={m.name} onSubmit={name => rename(m, name)} onCancel={() => setEditing(null)} />
            : <div className="row" style={{ gap: 10 }}>
              <div className="grow" {...tappable(() => nav('/models/' + m.id + '/plan'))}>
                <div className="tt">{m.name}</div>
                <div className="small dim">{routineCount(m.routines)} · {exCount(m.exercises)} · {dateOf(m.updated)}</div>
              </div>
              <button className="iconbtn" aria-label={t('Rename {0}', m.name)} onClick={() => setEditing(m.id)}><Icon name="pencil" /></button>
              <button className="iconbtn" aria-label={t('Delete {0}', m.name)} onClick={() => remove(m)}><Icon name="trash" /></button>
            </div>}
        </li>)}
      </ul>}
  </div>
}
