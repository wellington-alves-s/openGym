import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MUSCLES, INERT, MUSCLE_NAME } from '../lib/muscles.js'
import { labelLayout } from '../lib/body-labels.js'
import { t } from '../lib/i18n.js'
import { useBodyPaths } from './BodyMap.jsx'
import { Button } from './ui.jsx'

const EXT_RATIO = 0.36   // room for the name columns either side of the figure, as a share of the figure's width
const MARK = 24   // side of the little square a line ends on
// On a phone the figure is as wide as the screen allows and would leave the rest of the height
// empty, so it is drawn taller to fill what is left, up to MAX_TALL times (the body stretched, the
// lines and marks kept true). BELOW is what sits under it: the tab bar and the page margin.
const MAX_TALL = 1.5
const BELOW = 110
const phone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 520px)').matches

// One body at a time, front or back (the button turns it), each muscle named in the margin with a
// line to it. Tapping a name or the muscle itself picks it; `selected` is the list of picked muscles. Geometry and layout: lib/body-labels.js.
export default function BodyMapLabeled({ body = 'male', selected = [], onMuscle }) {
  const paths = useBodyPaths()
  const [back, setBack] = useState(false)
  const g = paths && (paths[body] || paths.male)
  const view = g && (back ? g.back : g.front)
  const layout = useMemo(() => view ? labelLayout(view) : [], [view])
  const box = useRef(null)
  const [K, setK] = useState(1)
  const shift = useRef(0)
  const [down, setDown] = useState(0)   // what is left once it is as tall as it gets, half of it above
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !view || !phone()) return
    const [, , vw0, vh0] = view.vb.split(' ').map(Number)
    const natural = w => w * vh0 / (vw0 * (1 + 2 * EXT_RATIO))
    const fit = () => {
      const r = el.getBoundingClientRect()
      if (!r.width) return
      const room = window.innerHeight - (r.top - shift.current) - BELOW   // measured without the margin it set
      const k = Math.min(MAX_TALL, Math.max(1, room / natural(r.width)))
      setK(k)
      shift.current = Math.max(0, Math.round((room - natural(r.width) * k) / 2))
      setDown(shift.current)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [view])
  if (!view) return <div className="bm-ph" aria-hidden="true" />
  const [vx, vy, vw, vh] = view.vb.split(' ').map(Number)
  const EXT = Math.round(vw * EXT_RATIO)
  const X = vx - EXT, W = vw + 2 * EXT
  const sy = y => vy + (y - vy) * K, VH = vh * K
  const top = y => ((sy(y) - vy) / VH * 100) + '%'
  return <div ref={box} className="bodymap bm-lab" style={{ aspectRatio: `${W} / ${VH}`, marginTop: down || undefined }}>
    <svg viewBox={`${X} ${vy} ${W} ${VH}`} role="group">
      <g transform={`translate(0 ${vy * (1 - K)}) scale(1 ${K})`}>
        {INERT.map(slug => (view.p[slug] || []).map((d, i) => <path key={slug + i} className="bm-sil" d={d} />))}
        {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) =>
          <path key={slug + i} className={'bm-m l0' + (selected.includes(slug) ? ' sel' : '')} d={d} onClick={() => onMuscle(slug)} />))}
      </g>
      {layout.map(l => {
        const edge = l.side === 'l' ? X + EXT : X + W - EXT
        return <g key={l.slug} className={'bm-line' + (selected.includes(l.slug) ? ' on' : '')}>
          <path d={`M${edge} ${sy(l.y)}H${l.ax}V${sy(l.ay)}`} />
          <rect x={l.ax - MARK / 2} y={sy(l.ay) - MARK / 2} width={MARK} height={MARK} />
        </g>
      })}
    </svg>
    {layout.map(l => <button key={l.slug} className={'bm-name ' + l.side + (selected.includes(l.slug) ? ' on' : '')}
      style={{ top: top(l.y), width: (EXT / W * 100) + '%' }} aria-pressed={selected.includes(l.slug)}
      onClick={() => onMuscle(l.slug)}>{t(MUSCLE_NAME[l.slug])}</button>)}
    <div className="bm-rot"><Button size="sm" variant="tinted" icon="repeat" onClick={() => setBack(b => !b)}>{t('Rotate')}</Button></div>
  </div>
}
