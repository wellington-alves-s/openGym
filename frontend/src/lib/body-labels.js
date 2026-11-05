import { MUSCLES } from './muscles.js'

// Where a labelled body map (components/BodyMapLabeled.jsx) puts its names and leader lines.
// Pure: it reads the muscle outlines in lib/body-paths.js, so no DOM measuring is needed.

const ARGS = { m: 2, l: 2, c: 6, q: 4, a: 7 }
const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/y

// Bounding box of an SVG path. The outlines only use m/l/c/q/a/z; curve control points count as
// part of the box (a hair bigger than the curve), which is plenty to find a muscle's centre.
export function pathBox(d) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  let x = 0, y = 0, sx = 0, sy = 0, i = 0, cmd = ''
  const take = (px, py) => {
    box.x0 = Math.min(box.x0, px); box.x1 = Math.max(box.x1, px)
    box.y0 = Math.min(box.y0, py); box.y1 = Math.max(box.y1, py)
  }
  const skip = () => { while (i < d.length && ' ,\n\t\r'.includes(d[i])) i++ }
  const num = () => { skip(); NUM.lastIndex = i; const m = NUM.exec(d); if (!m) return NaN; i = NUM.lastIndex; return +m[0] }
  const flag = () => { skip(); const v = d[i] === '1' ? 1 : 0; i++; return v }   // arc flags may touch the next number
  for (;;) {
    skip()
    if (i >= d.length) break
    let fresh = false
    if (/[a-zA-Z]/.test(d[i])) { cmd = d[i++]; fresh = true }
    const lc = cmd.toLowerCase(), rel = cmd === lc
    if (lc === 'z') { if (!fresh) break; x = sx; y = sy; continue }
    if (!ARGS[lc]) break
    const a = []
    for (let k = 0; k < ARGS[lc]; k++) a.push(lc === 'a' && (k === 3 || k === 4) ? flag() : num())
    if (a.some(Number.isNaN)) break
    const ox = rel ? x : 0, oy = rel ? y : 0
    if (lc === 'c') { take(ox + a[0], oy + a[1]); take(ox + a[2], oy + a[3]) }
    if (lc === 'q') take(ox + a[0], oy + a[1])
    x = ox + a[ARGS[lc] - 2]; y = oy + a[ARGS[lc] - 1]
    take(x, y)
    if (lc === 'm' && fresh) { sx = x; sy = y }
  }
  return box
}

// One entry per muscle drawn in `view`, top to bottom, alternating left and right of the figure.
// `ax, ay`: the point on the muscle (the outer-most piece on its label's side) the line ends on.
// `y`: where the name sits, the same height as `ay` unless a neighbour on that side is closer than `gap`.
export function labelLayout(view, gap = 95) {
  const items = []
  for (const slug of MUSCLES) {
    const boxes = (view.p[slug] || []).map(pathBox).filter(b => b.x0 <= b.x1)
      .map(b => ({ cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 }))
      .sort((a, b) => a.cx - b.cx)
    if (boxes.length) items.push({ slug, boxes, mid: boxes.reduce((s, b) => s + b.cy, 0) / boxes.length })
  }
  items.sort((a, b) => a.mid - b.mid)
  const out = items.map((it, n) => {
    const side = n % 2 ? 'r' : 'l'
    const b = side === 'l' ? it.boxes[0] : it.boxes[it.boxes.length - 1]
    return { slug: it.slug, side, ax: b.cx, ay: b.cy, y: b.cy }
  })
  for (const side of ['l', 'r']) {
    let prev = -Infinity
    for (const l of out.filter(o => o.side === side).sort((a, b) => a.y - b.y)) {
      l.y = Math.max(l.y, prev + gap)
      prev = l.y
    }
  }
  return out
}
