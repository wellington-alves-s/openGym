import { describe, expect, it } from 'vitest'
import { pathBox, labelLayout } from './body-labels.js'
import paths from './body-paths.js'
import { MUSCLES } from './muscles.js'

describe('pathBox', () => {
  it('follows absolute and relative moves, lines and curves', () => {
    expect(pathBox('M10 20l30 10z')).toEqual({ x0: 10, y0: 20, x1: 40, y1: 30 })
    expect(pathBox('M0 0c10 -5 20 5 30 0')).toEqual({ x0: 0, y0: -5, x1: 30, y1: 5 })
  })
  it('reads arcs whose flags touch the next number', () => {
    expect(pathBox('M5 5a.2.2 0 01-.2-.2l10 10')).toEqual({ x0: 4.8, y0: 4.8, x1: 14.8, y1: 14.8 })
  })
  it('stops on a path it cannot read instead of looping', () => {
    expect(pathBox('M1 2 9')).toEqual({ x0: 1, y0: 2, x1: 1, y1: 2 })
  })
})

describe('labelLayout', () => {
  for (const view of ['front', 'back']) {
    const g = paths.male[view]
    const layout = labelLayout(g)
    it(`${view}: names every drawn muscle once, alternating sides, on the figure`, () => {
      const drawn = MUSCLES.filter(m => g.p[m]?.length)
      expect(layout.map(l => l.slug).sort()).toEqual(drawn.sort())
      const [vx, vy, vw, vh] = g.vb.split(' ').map(Number)
      for (const l of layout) {
        expect(l.ax).toBeGreaterThan(vx); expect(l.ax).toBeLessThan(vx + vw)
        expect(l.ay).toBeGreaterThan(vy); expect(l.ay).toBeLessThan(vy + vh)
      }
      expect(layout.some(l => l.side === 'l') && layout.some(l => l.side === 'r')).toBe(true)
    })
    it(`${view}: names on one side never sit closer than the gap`, () => {
      for (const side of ['l', 'r']) {
        const ys = layout.filter(l => l.side === side).map(l => l.y).sort((a, b) => a - b)
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(95 - 1e-6)
      }
    })
  }
})
