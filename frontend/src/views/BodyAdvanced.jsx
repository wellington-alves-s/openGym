// The Advanced tab of the Body screen: skinfold body fat, body composition and ideal weight from
// lib/body-assessment.js (kg in, shown in the profile's kg or lb), and what is missing for them.
import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { assessmentSeries, latestAssessment } from '../lib/body-assessment.js'
import { ADVANCED_MEASUREMENT_KEYS, normalizeMeasurementsState } from '../lib/measurements.js'
import { latestWeighIn } from '../lib/bmi.js'
import LineChart from '../components/LineChart.jsx'
import { Button } from '../components/ui.jsx'

const MISSING = {
  'needs-sex': () => t('Enter your sex in the Diagnosis card'),
  'needs-age': () => t('Enter your birth date in the Diagnosis card'),
  'age-out-of-range': () => t('Skinfold formulas need an age from 18 to 61'),
  'needs-skinfolds': () => t('Log your skinfolds in Measurements'),
  'needs-height': () => t('Enter your height'),
  'needs-weight': () => t('Log your weight'),
  'needs-bones': () => t('Log your wrist and femur diameters for the advanced composition'),
}
// Indigo is no preset accent's --acc, so the two lines never share a colour.
const COLORS = ['var(--acc)', 'var(--indigo)']

function Row({ label, value, extra }) {
  return <div className="row between" style={{ padding: '4px 0' }}>
    <span>{label}</span>
    <span><b>{value}</b>{extra && <span className="muted small"> {extra}</span>}</span>
  </div>
}

export default function BodyAdvanced({ S }) {
  const a = latestAssessment(S, todayISO())
  // Memoised: LineChart drops its hover on a new points array.
  const chart = useMemo(() => {
    const series = assessmentSeries(S)
    const pt = (p, y) => ({ t: new Date(p.d + 'T12:00:00').getTime(), y, d: p.d })
    const lines = ['jp7', 'jp3'].map((k, i) => ({ points: series.filter(p => p[k] !== null).map(p => pt(p, p[k])), color: COLORS[i] }))
      .filter(s => s.points.length)
    const anchors = series.map(p => ({ ...pt(p, p.jp7 ?? p.jp3), note: [p.jp7, p.jp3].map((v, i) => v === null ? null : (i ? '3: ' : '7: ') + fmtNum(v) + '%').filter(Boolean).join(' · ') }))
    return { lines, anchors }
  }, [S])
  const inUnit = v => (S.unit === 'lb' ? v * 2.2046226218 : v)
  const kg = v => fmtNum(inUnit(v)) + ' ' + S.unit
  const part = (label, v) => <Row key={label} label={label} value={kg(v)} extra={fmtNum(v / a.weightKg * 100) + '%'} />
  const enabled = S.measurementEnabled || []
  const offKeys = ADVANCED_MEASUREMENT_KEYS.filter(k => !enabled.includes(k))
  const turnOn = () => useStore.getState().update(s => {
    normalizeMeasurementsState(s)
    s.measurementEnabled.push(...ADVANCED_MEASUREMENT_KEYS.filter(k => !s.measurementEnabled.includes(k)))
  })
  const switchButton = offKeys.length > 0 && <Button size="sm" variant="tinted" onClick={turnOn}>{t('Turn on skinfolds and bones')}</Button>
  const { jp7, jp3 } = a.fat
  const hasFat = jp7 !== null || jp3 !== null
  // The invitation only when nothing is logged; logged skinfolds get the list of what is missing.
  if (a.missing.includes('needs-skinfolds') && !hasFat && !a.simple && !a.ideal) return <div className="card">
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Log your skinfolds to estimate your body fat and body composition.')}</div>
    {switchButton}
  </div>
  const last = latestWeighIn(S)
  // Compared with the bounds as shown: 175 cm gives 125.002 lb, shown as 125, and 125 is within.
  const shownBound = kgv => Math.round(inUnit(kgv) * 10) / 10
  return <>
    {hasFat && <div className="card">
      <div className="row between"><h2 style={{ margin: 0 }}>{t('Body fat')}</h2><span className="muted small">{fmtDate(a.d, true)}</span></div>
      {jp7 !== null && <Row label={t('Jackson and Pollock 7 skinfolds')} value={fmtNum(jp7) + '%'} />}
      {jp3 !== null && <Row label={t('Jackson and Pollock 3 skinfolds')} value={fmtNum(jp3) + '%'} />}
      {chart.lines.length > 0 && <div className="chart"><LineChart points={chart.anchors} series={chart.lines} h={150} unit="%" /></div>}
      <div className="muted small" style={{ marginTop: 6 }}>{t('Estimates for adults from 18 to 61. They depend on how the skinfolds are measured.')}</div>
    </div>}
    {a.simple && <div className="card">
      <h2>{t('Body composition')}</h2>
      {part(t('Fat mass'), a.simple.fat)}
      {part(t('Lean mass'), a.simple.lean)}
      {a.advanced && <div style={{ borderTop: '1px solid var(--sep-op)', marginTop: 8, paddingTop: 8 }}>
        {part(t('Fat mass'), a.advanced.fat)}
        {part(t('Bone mass'), a.advanced.bone)}
        {part(t('Residual mass'), a.advanced.residual)}
        {part(t('Muscle mass'), a.advanced.muscle)}
      </div>}
    </div>}
    {a.ideal && <div className="card">
      <h2>{t('Ideal weight')}</h2>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{kg(a.ideal.minKg) + ' – ' + kg(a.ideal.maxKg)}</div>
      {last && <div className="muted small" style={{ marginTop: 4 }}>{Number(last.w) < shownBound(a.ideal.minKg) ? t('Your latest weight is below this range')
        : Number(last.w) > shownBound(a.ideal.maxKg) ? t('Your latest weight is above this range') : t('Your latest weight is within this range')}</div>}
    </div>}
    {(a.missing.length > 0 || switchButton) && <div className="card">
      {a.missing.map(m => <div key={m} className="muted small" style={{ marginBottom: 6 }}>{MISSING[m]()}</div>)}
      {switchButton}
    </div>}
  </>
}
