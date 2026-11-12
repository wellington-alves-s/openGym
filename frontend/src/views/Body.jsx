// The Body screen: the latest progress photos, then Weight, Measurements and Advanced tabs (the tab
// kept in ?tab=, so /measurements can land on its tab), and the Diagnosis card under all three.
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { normalizeBirthDate } from '../lib/body-profile.js'
import { weighInAt } from '../lib/bodyweight.js'
import { bmiOf, normalizeHeightCm } from '../lib/bmi.js'
import { goalGap } from '../lib/body-goal.js'
import { fromMeasurementDisplay, measurementUnit, toMeasurementDisplay } from '../lib/measurements.js'
import { goalSheet, weighInsSheet, bwDeltaColor } from '../sheets.jsx'
import { bodyCheckinSheet } from '../components/BodyCheckinSheet.jsx'
import { CustomThumb } from '../components/CustomMedia.jsx'
import LineChart from '../components/LineChart.jsx'
import WeightRate from '../components/WeightRate.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Segmented } from '../components/ui.jsx'
import { progressPhotosOf, openPhotoView } from './ProgressPhotos.jsx'
import { rangeOptions } from './Stats.jsx'
import MeasurementsTab from './Measurements.jsx'
import BodyAdvanced from './BodyAdvanced.jsx'

const BAND = { under: () => t('Underweight'), normal: () => t('Normal weight'), over: () => t('Overweight'), obese: () => t('Obesity') }

function Photos({ S }) {
  const nav = useNavigate()
  const photos = useMemo(() => progressPhotosOf(S).slice(0, 10), [S.workouts, S.dayPhotos])
  if (!photos.length) return <div className="card">
    <div className="muted small" style={{ marginBottom: 10 }}>{t('No progress photos yet. Add one for today or any day before.')}</div>
    <Button size="sm" icon="camera" onClick={() => bodyCheckinSheet()}>{t('Check-in')}</Button>
  </div>
  return <div className="card">
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Progress photos')}</h2>
      <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/progress-photos')}>{t('See all')}</Button>
    </div>
    <div className="row body-photos" data-swipe-ignore style={{ gap: 8, overflowX: 'auto', alignItems: 'flex-start' }}>
      {photos.map(p => {
        const bw = S.bodyweight.find(b => b.d === p.d)
        return <button key={p.key} type="button" className="wmedia-item" style={{ flex: '0 0 84px' }}
          aria-label={fmtDate(p.d, true)} onClick={() => openPhotoView(p)}>
          <CustomThumb ex={{ custom: true, media: p.m }} />
          <span className="small muted" style={{ display: 'block' }}>{fmtDate(p.d, true)}</span>
          {bw && <span className="small" style={{ display: 'block' }}>{fmtNum(bw.w) + ' ' + S.unit}</span>}
        </button>
      })}
    </div>
  </div>
}

function WeightTab({ S }) {
  const [range, setRange] = useState(90)
  const bws = S.bodyweight
  const last = bws.at(-1), prev = bws.at(-2)
  const delta = last && prev ? last.w - prev.w : null
  const gap = last ? goalGap(last.w, S.targetW, prev?.w) : null
  // Memoised with the range start captured once, as in Stats: LineChart drops its hover on a new array.
  const pts = useMemo(() => {
    const from = Date.now() - range * 86400000
    return bws.filter(b => range === 0 || weighInAt(b) > from).map(b => ({ t: weighInAt(b), y: b.w, d: b.d }))
  }, [bws, range])
  return <div className="card">
    <div className="row between bw-head" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
      {last ? <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>{fmtNum(last.w) + ' ' + S.unit}</div>
        {delta != null && <div className="small" style={{ color: bwDeltaColor(delta, last.w) }}>{(delta > 0 ? '+' : '') + fmtNum(delta) + ' ' + S.unit}</div>}
        {/* diff can be -0 (body-goal.js); a falsy one means the goal is reached */}
        {gap && gap.diff ? <div className="small muted">{t('{0} to go', fmtNum(Math.abs(gap.diff)) + ' ' + S.unit)}</div> : null}
      </div> : <div className="muted">{t('Log your weight')}</div>}
      <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
    </div>
    {last && <>
      <Segmented className="seg-range" value={range} onChange={setRange} options={rangeOptions()} />
      <div className="chart"><LineChart points={pts} h={160} unit={S.unit} goal={S.targetW} /></div>
      <WeightRate S={S} />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={weighInsSheet}>{t('All weigh-ins')}</Button>
      </div>
    </>}
  </div>
}

function Diagnosis({ S }) {
  const unit = measurementUnit(S.unit)
  const shown = toMeasurementDisplay(S.heightCm, S.unit)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(shown)
  const b = bmiOf(S)
  const save = () => {
    // Unchanged: 180 cm shows as 70.9 in and would come back as 180.1, restamped.
    if (S.heightCm != null && draft === shown) { setEditing(false); return }
    const cm = normalizeHeightCm(fromMeasurementDisplay(draft, S.unit))
    if (cm === null) { useUI.getState().toast(t('Enter a valid height')); return }
    useStore.getState().update(s => { s.heightCm = cm })
    setEditing(false)
  }
  const [editingBirth, setEditingBirth] = useState(false)
  const [birthDraft, setBirthDraft] = useState(S.birthDate || '')
  const saveBirth = () => {
    if (S.birthDate != null && birthDraft === S.birthDate) { setEditingBirth(false); return }
    const d = normalizeBirthDate(birthDraft)
    if (d === null) { useUI.getState().toast(t('Enter a valid birth date')); return }
    useStore.getState().update(s => { s.birthDate = d })
    setEditingBirth(false)
  }
  const setSex = v => { if (S.sex !== v) useStore.getState().update(s => { s.sex = v }) }
  return <div className="card">
    <h2>{t('Diagnosis')}</h2>
    {S.heightCm == null || editing ? <>
      <div className="muted small" style={{ marginBottom: 8 }}>{t('Enter your height')}</div>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <NumberField nullable value={draft} onChange={setDraft} aria-label={t('Height')} />
        <span className="muted">{unit}</span>
        <Button size="sm" variant="tinted" onClick={save}>{t('Save')}</Button>
        {editing && S.heightCm != null && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('Cancel')}</Button>}
      </div>
    </> : <div className="row between" style={{ alignItems: 'center' }}>
      <span>{t('Height')} {fmtNum(shown) + ' ' + unit}</span>
      <Button size="sm" variant="ghost" onClick={() => { setDraft(shown); setEditing(true) }}>{t('Edit')}</Button>
    </div>}
    <div className="row between" style={{ alignItems: 'center', marginTop: 8 }}>
      <span>{t('Sex')}</span>
      <div className="row" style={{ gap: 6 }}>
        {[['m', t('Male')], ['f', t('Female')]].map(([v, label]) =>
          <Button key={v} size="sm" variant={S.sex === v ? 'tinted' : 'ghost'} aria-pressed={S.sex === v} onClick={() => setSex(v)}>{label}</Button>)}
      </div>
    </div>
    {S.birthDate == null || editingBirth
      ? <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 8 }}>
        <span>{t('Birth date')}</span>
        <input type="date" className="timef" value={birthDraft} max={todayISO()} aria-label={t('Birth date')} onChange={e => setBirthDraft(e.target.value)} />
        <Button size="sm" variant="tinted" onClick={saveBirth}>{t('Save')}</Button>
        {editingBirth && S.birthDate != null && <Button size="sm" variant="ghost" onClick={() => setEditingBirth(false)}>{t('Cancel')}</Button>}
      </div>
      : <div className="row between" style={{ alignItems: 'center', marginTop: 8 }}>
        <span>{t('Birth date')} {fmtDate(S.birthDate, true, true)}</span>
        <Button size="sm" variant="ghost" onClick={() => { setBirthDraft(S.birthDate); setEditingBirth(true) }}>{t('Edit')}</Button>
      </div>}
    {S.heightCm != null && (b ? <div style={{ marginTop: 12 }}>
      <div><span className="muted">{t('BMI')} </span><b style={{ fontSize: 22 }}>{fmtNum(b.value)}</b> <span>{BAND[b.band]()}</span></div>
      <div className="muted small" style={{ marginTop: 4 }}>{t('BMI is only a reference. It does not tell muscle from fat.')}</div>
    </div> : <div className="muted small" style={{ marginTop: 12 }}>{t('Log your weight')}</div>)}
  </div>
}

export default function Body() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [params, setParams] = useSearchParams()
  const tab = ['measurements', 'advanced'].includes(params.get('tab')) ? params.get('tab') : 'weight'
  return <>
    <div className="hdr"><button className="iconbtn" data-back="/stats" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Body')}</h1></div>
      <Button size="sm" variant="tinted" icon="plus" onClick={() => bodyCheckinSheet()}>{t('Check-in')}</Button>
    </div>
    <Photos S={S} />
    <Segmented value={tab} onChange={v => setParams({ tab: v }, { replace: true })}
      options={[{ value: 'weight', label: t('Weight') }, { value: 'measurements', label: t('Measurements') }, { value: 'advanced', label: t('Advanced') }]} />
    <div style={{ height: 12 }} />
    {tab === 'weight' ? <WeightTab S={S} /> : tab === 'advanced' ? <BodyAdvanced S={S} /> : <MeasurementsTab />}
    <Diagnosis S={S} />
  </>
}
