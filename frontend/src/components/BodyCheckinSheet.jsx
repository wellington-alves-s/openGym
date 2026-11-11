// The Register sheet of the Body screen: one date's weight, photos, note and measurements, saved
// together as one check-in (lib/body-checkin.js). The photos are filed the way the progress
// photos screen files them (fileProgressPhotos), all on the check-in's date.
import { useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { checkinOf, applyCheckin } from '../lib/body-checkin.js'
import { MEASUREMENT_FIELDS, enabledMeasurementFields, measurementUnit, measurementUnitLabel } from '../lib/measurements.js'
import { bodyWeightMax } from '../lib/bodyweight.js'
import { serverTakesDayPhotos } from '../lib/day-photos.js'
import { syncMedia } from '../lib/media-sync.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { useMediaPicker } from './CustomMediaField.jsx'
import { Button, NumberField, TextField } from './ui.jsx'
import { manageMeasurementsSheet } from '../views/Measurements.jsx'
import { fileProgressPhotos, MAX_AT_ONCE } from '../views/ProgressPhotos.jsx'

const toast = m => useUI.getState().toast(m)
const hasContent = c => c.weight != null || Object.keys(c.measurements).length > 0 || c.note !== ''

// The fields shown: the active ones, plus any the date already holds, even if switched off since.
function fieldsFor(S, d) {
  const fields = [...enabledMeasurementFields(S)]
  const entry = (S.measurements || []).find(e => e.d === d)
  if (entry) {
    for (const f of MEASUREMENT_FIELDS) {
      if (entry[f.key] != null && !fields.some(x => x.key === f.key)) fields.push(f)
    }
    for (const o of entry.other || []) {
      if (o.value != null && !fields.some(x => x.key === 'other:' + o.id)) {
        fields.push({ key: 'other:' + o.id, label: o.name, unit: o.unit, custom: true, group: 'Other' })
      }
    }
  }
  return fields
}

function BodyCheckin({ start, close }) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const { pick, busy, canAdd, showAdd } = useMediaPicker()
  const fileRef = useRef(null)
  const [date, setDate] = useState(start)
  const [loaded, setLoaded] = useState(() => checkinOf(S, start))
  const [weight, setWeight] = useState(loaded.weight)
  const [values, setValues] = useState(loaded.measurements)
  // Only edited measurements are sent: re-saving a shown value would drift cm through inches.
  const [touched, setTouched] = useState(() => new Set())
  const [note, setNote] = useState(loaded.note)
  const [files, setFiles] = useState([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const fields = fieldsFor(S, date)

  const changeDate = d => {
    const c = checkinOf(S, d)
    setDate(d); setLoaded(c); setWeight(c.weight); setValues(c.measurements); setTouched(new Set()); setNote(c.note)
  }
  const setField = (key, value) => {
    setValues(v => ({ ...v, [key]: value }))
    setTouched(s => new Set(s).add(key))
  }
  const onFiles = ev => {
    const picked = [...(ev.target.files || [])]
    ev.target.value = ''
    setFiles(cur => [...cur, ...picked].slice(0, MAX_AT_ONCE))
  }

  const refusal = res => {
    switch (res.reason) {
      case 'weight-invalid': return t('Enter a valid weight')
      case 'weight-too-heavy': return t('That looks too heavy. Keep it at {0} or less.', fmtNum(bodyWeightMax(S.unit)) + ' ' + S.unit)
      case 'percent-range': {
        if (res.field === 'bodyFat') return t('Body fat must be between 0 and 100%.')
        const f = fields.find(x => x.key === res.field)
        return t('{0} must be between 0 and 100%.', f ? t(f.label) : res.field)
      }
      default: return t('Choose a valid date')
    }
  }

  const save = async () => {
    if (saving || busy) return
    const input = { d: date, measurements: {} }
    // An unchanged weight or note is not re-sent: that would restamp it (and drop a Health mark).
    if (weight != null && weight !== loaded.weight) input.weight = weight
    for (const key of touched) input.measurements[key] = values[key] ?? null
    if (note !== loaded.note) input.note = note
    let res
    if (input.weight != null || touched.size || input.note !== undefined) {
      useStore.getState().update(s => { res = applyCheckin(s, input) })
    } else res = applyCheckin({}, { d: date }) // only checks the date: nothing to write
    if (!res.ok && res.reason !== 'empty') { toast(refusal(res)); return }
    if (!res.ok && !files.length) {
      // An edit saved without a change has nothing to write, and nothing went wrong.
      if (hasContent(loaded)) close(); else toast(t('Fill in at least one item'))
      return
    }
    let n = { added: 0, noRoom: 0 }
    if (files.length) {
      setSaving(true)
      try {
        n = await fileProgressPhotos({ files: files.map(file => ({ file, exif: null })), d: date, pick, update: useStore.getState().update, canDay: serverTakesDayPhotos(user, config) })
      } finally { setSaving(false) }
      if (n.added) syncMedia({ force: true })
    }
    const noRoom = () => toast(t('Your server keeps photos only on days with a workout. An update lets it keep them for any day.'))
    if (!res.ok && !n.added) { if (n.noRoom) noRoom(); return } // only photos, and none went in
    close()
    toast(t('Check-in saved'))
    if (n.noRoom) noRoom()
  }

  return <>
    <h3>{hasContent(loaded) ? t('Edit check-in') : t('Check-in')}</h3>
    <label className="measure-date">
      <span>{t('Date')}</span>
      <input className="field" type="date" value={date} max={todayISO()} onChange={e => changeDate(e.target.value)} />
    </label>
    <div className="measure-form">
      <label className="measure-field checkin-weight">
        <span>{t('Weight')}</span>
        <span className="measure-input">
          <NumberField nullable value={weight} onChange={setWeight} />
          <i>{S.unit}</i>
        </span>
      </label>
      <label className="measure-field checkin-note">
        <span>{t('Note')}</span>
        <TextField value={note} maxLength={200} onChange={e => setNote(e.target.value)} />
      </label>
    </div>
    {showAdd && <div style={{ margin: '12px 0' }}>
      <Button icon="camera" disabled={!canAdd || saving} onClick={() => fileRef.current?.click()}>{t('Add photos')}</Button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      {files.map((f, i) => <div className="row between small" key={i}>
        <span>{f.name}</span>
        <Button variant="ghost" size="sm" icon="xmark" aria-label={t('Remove')} title={t('Remove')}
          onClick={() => setFiles(cur => cur.filter((_, j) => j !== i))} />
      </div>)}
    </div>}
    <Button variant="ghost" icon={open ? 'chevronDown' : 'chevronRight'} aria-expanded={open} onClick={() => setOpen(o => !o)}>{t('Measurements')}</Button>
    {open && <>
      {fields.length ? <div className="measure-form">
        {fields.map(field => <label className="measure-field" key={field.key}>
          <span>{t(field.label)}</span>
          <span className="measure-input">
            <NumberField nullable value={values[field.key] ?? null} onChange={value => setField(field.key, value)} />
            <i>{measurementUnitLabel(measurementUnit(S.unit, field))}</i>
          </span>
        </label>)}
      </div> : <div className="empty small">{t('Choose at least one measurement first.')}</div>}
      <Button variant="ghost" size="sm" onClick={manageMeasurementsSheet}>{t('Choose measurements')}</Button>
    </>}
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={saving || busy} onClick={save}>{saving ? t('Loading…') : t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" disabled={saving} onClick={close}>{t('Cancel')}</Button>
  </>
}

export function bodyCheckinSheet(date = todayISO()) {
  return useUI.getState().openSheet(close => <BodyCheckin start={date} close={close} />)
}
