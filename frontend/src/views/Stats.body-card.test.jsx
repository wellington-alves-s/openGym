// @vitest-environment happy-dom
// The Body card on Stats: one way into the Body screen, dated by the latest weigh-in or measurement.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Stats from './Stats.jsx'
import { fmtDate } from '../lib/format.js'

const mocks = vi.hoisted(() => ({ S: null, nav: [] }))
vi.mock('../store/useStore.js', () => ({ useStore: selector => selector({ S: mocks.S }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => to => mocks.nav.push(to) }))
vi.mock('../sheets.jsx', () => ({
  bwSheet: () => {}, goalSheet: () => {}, calendarSheet: () => {}, workoutDetailSheet: () => {}, exerciseHistorySheet: () => {}, weighInsSheet: () => {},
  WorkoutRow: () => null, bwDeltaColor: () => 'inherit',
}))
vi.mock('../components/LineChart.jsx', () => ({ default: () => null }))
vi.mock('../components/Heatmap.jsx', () => ({ default: () => null }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null, BodyMapLegend: () => null }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
let root, host
afterEach(() => { act(() => root.unmount()); host.remove(); mocks.nav = [] })

function mount(extra = {}) {
  mocks.S = { body: 'male', effort: 'none', unit: 'kg', targetW: null, bodyweight: [], routines: [], exWeights: {}, workouts: [], ...extra }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<Stats />))
}
const card = title => [...host.querySelectorAll('.card')].find(c => c.querySelector('h2')?.textContent === title)

describe('Stats: the Body card', () => {
  it('replaces the photos and measurements cards and opens /body', () => {
    mount()
    expect(card('Progress photos')).toBeUndefined()
    expect(card('Body measurements')).toBeUndefined()
    const body = card('Body')
    expect(body).toBeTruthy()
    act(() => [...body.querySelectorAll('button')].find(b => b.textContent === 'Open').click())
    expect(mocks.nav).toEqual(['/body'])
  })

  it('invites a first check-in when there is nothing logged', () => {
    mount()
    expect(card('Body').textContent).toContain('Waist, arms, body fat and anything else you measure, each with its own curve.')
  })

  it('dates the latest of the last weigh-in and the last measurement', () => {
    mount({ bodyweight: [{ d: ago(5), w: 80 }], measurements: [{ d: ago(3), waist: 80 }] })
    expect(card('Body').textContent).toContain('Last check-in ' + fmtDate(ago(3), true))
    act(() => root.unmount()); host.remove()
    mount({ bodyweight: [{ d: ago(3), w: 80 }], measurements: [{ d: ago(5), waist: 80 }] })
    expect(card('Body').textContent).toContain('Last check-in ' + fmtDate(ago(3), true))
  })
})
