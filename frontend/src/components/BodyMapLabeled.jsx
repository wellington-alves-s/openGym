import { useMemo, useState } from 'react'
import { MUSCLES, INERT, MUSCLE_NAME } from '../lib/muscles.js'
import { labelLayout } from '../lib/body-labels.js'
import { t } from '../lib/i18n.js'
import { useBodyPaths } from './BodyMap.jsx'
import { Button } from './ui.jsx'

const EXT = 210   // room for the name columns either side of the figure, in the figure's own units
const MARK = 24   // side of the little square a line ends on

// One body at a time, front or back (the button turns it), each muscle named in the margin with a
// line to it. Tapping a name or the muscle itself picks it; `selected` is the list of picked muscles. Geometry and layout: lib/body-labels.js.
export default function BodyMapLabeled({ body = 'male', selected = [], onMuscle }) {
  const paths = useBodyPaths()
  const [back, setBack] = useState(false)
  const g = paths && (paths[body] || paths.male)
  const view = g && (back ? g.back : g.front)
  const layout = useMemo(() => view ? labelLayout(view) : [], [view])
  if (!view) return <div className="bm-ph" aria-hidden="true" />
  const [vx, vy, vw, vh] = view.vb.split(' ').map(Number)
  const X = vx - EXT, W = vw + 2 * EXT
  const top = y => ((y - vy) / vh * 100) + '%'
  return <div className="bodymap bm-lab" style={{ aspectRatio: `${W} / ${vh}` }}>
    <svg viewBox={`${X} ${vy} ${W} ${vh}`} role="group">
      {INERT.map(slug => (view.p[slug] || []).map((d, i) => <path key={slug + i} className="bm-sil" d={d} />))}
      {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) =>
        <path key={slug + i} className={'bm-m l0' + (selected.includes(slug) ? ' sel' : '')} d={d} onClick={() => onMuscle(slug)} />))}
      {layout.map(l => {
        const edge = l.side === 'l' ? X + EXT : X + W - EXT
        return <g key={l.slug} className={'bm-line' + (selected.includes(l.slug) ? ' on' : '')}>
          <path d={`M${edge} ${l.y}H${l.ax}V${l.ay}`} />
          <rect x={l.ax - MARK / 2} y={l.ay - MARK / 2} width={MARK} height={MARK} />
        </g>
      })}
    </svg>
    {layout.map(l => <button key={l.slug} className={'bm-name ' + l.side + (selected.includes(l.slug) ? ' on' : '')}
      style={{ top: top(l.y), width: (EXT / W * 100) + '%' }} aria-pressed={selected.includes(l.slug)}
      onClick={() => onMuscle(l.slug)}>{t(MUSCLE_NAME[l.slug])}</button>)}
    <div className="bm-rot"><Button size="sm" variant="tinted" icon="repeat" onClick={() => setBack(b => !b)}>{t('Rotate')}</Button></div>
  </div>
}
