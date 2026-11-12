// @vitest-environment happy-dom
/* The Body screen: progress photos, the weight tab and the BMI card, with the tab kept in ?tab=. */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(() => Promise.reject(new Error('offline'))), beacon: vi.fn() }))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Body from './Body.jsx'
import { ADVANCED_MEASUREMENT_KEYS } from '../lib/measurements.js'
import { assessmentOf } from '../lib/body-assessment.js'
import { fmtNum } from '../lib/format.js'

const clone = v => JSON.parse(JSON.stringify(v))
const mounted = []
let where = null
function Where() { where = useLocation(); return null }
function render(el, url = '/body') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<MemoryRouter initialEntries={[url]}>{el}<Where /></MemoryRouter>))
  return host
}
const setValue = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.getAttribute('aria-label') === text)
const click = (host, text) => act(() => { button(host, text).click() })
const toast = () => useUI.getState().toastMsg
const S = () => useStore.getState().S
const ref = n => ({ kind: 'image', hash: String(n).padStart(64, '0'), mime: 'image/jpeg', size: 10, width: 4, height: 3, at: 1 })

function seed(extra = {}) {
  useStore.setState({ S: Object.assign(clone(DEF), { unit: 'kg', bodyweight: [], measurements: [], workouts: [], heightCm: null, targetW: null }, extra), user: null, config: null })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '' })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('the Body screen', () => {
  it('renders empty: no photos, no weight, BMI asking for height; Check-in opens the sheet', () => {
    seed()
    const host = render(<Body />)
    expect(host.querySelector('[data-back]').getAttribute('data-back')).toBe('/stats')
    expect(host.textContent).toContain('No progress photos yet.')
    expect(host.textContent).toContain('Log your weight')
    expect(host.textContent).toContain('Enter your height')
    act(() => { host.querySelector('.hdr button:last-child').click() })
    expect(useUI.getState().sheets).toHaveLength(1)
  })

  it('with weigh-ins and a goal shows the gap to the goal and the chart', () => {
    const now = Date.now()
    seed({ targetW: 75, bodyweight: [{ d: '2026-11-01', w: 80, t: now - 3 * 86400000 }, { d: '2026-11-08', w: 79.5, t: now - 86400000 }] })
    const host = render(<Body />)
    expect(host.textContent).toContain('79.5 kg')
    expect(host.textContent).toContain('-0.5 kg')
    expect(host.textContent).toContain('4.5 kg to go')
    expect(host.querySelector('.chart svg')).not.toBeNull()
    expect(button(host, '75')).toBeTruthy()
  })

  it('?tab=measurements shows Measurements, and switching tabs writes the URL', () => {
    seed()
    const host = render(<Body />, '/body?tab=measurements')
    expect(host.textContent).toContain('Measurement history')
    expect(host.querySelectorAll('.hdr')).toHaveLength(1)   // the tab brings no header of its own
    click(host, 'Weight')
    expect(where.search).toBe('?tab=weight')
    expect(host.textContent).not.toContain('Measurement history')
    click(host, 'Measurements')
    expect(where.search).toBe('?tab=measurements')
  })

  it('shows BMI 22.9 and the normal band for 70 kg and 175 cm', () => {
    seed({ heightCm: 175, bodyweight: [{ d: '2026-11-08', w: 70, t: 1 }] })
    const host = render(<Body />)
    expect(host.textContent).toContain('22.9')
    expect(host.textContent).toContain('Normal weight')
    expect(host.textContent).toContain('175 cm')
  })

  it('saves a height in cm, converts inches on an lb profile, and refuses one out of range', () => {
    seed()
    let host = render(<Body />)
    setValue(host.querySelector('input.num'), '175')
    click(host, 'Save')
    expect(S().heightCm).toBe(175)

    seed({ unit: 'lb' })
    host = render(<Body />)
    setValue(host.querySelector('input.num'), '68,9')
    click(host, 'Save')
    expect(S().heightCm).toBe(175)

    seed()
    host = render(<Body />)
    setValue(host.querySelector('input.num'), '10')
    click(host, 'Save')
    expect(toast()).toBe('Enter a valid height')
    expect(S().heightCm).toBe(null)
  })

  it('in lb, Edit then Save with the shown height unchanged leaves heightCm as it was', () => {
    seed({ unit: 'lb', heightCm: 180 })
    const host = render(<Body />)
    const before = S()
    click(host, 'Edit')
    click(host, 'Save')
    expect(S().heightCm).toBe(180)
    expect(S()).toBe(before)                     // nothing written, nothing restamped
    expect(host.querySelector('input.num')).toBeNull()
  })

  it('Cancel leaves the height edit without writing', () => {
    seed({ heightCm: 180 })
    const host = render(<Body />)
    const before = S()
    click(host, 'Edit')
    setValue(host.querySelector('input.num'), '170')
    click(host, 'Cancel')
    expect(S()).toBe(before)
    expect(host.querySelector('input.num')).toBeNull()
    expect(host.textContent).toContain('180 cm')
  })

  it('lists the photos with the day\'s weight, and a tap opens the photo', () => {
    seed({
      bodyweight: [{ d: '2026-10-01', w: 81, t: 1 }],
      workouts: [{ id: 'w1', d: '2026-10-01', start: 1, entries: [], media: [ref(1)] }, { id: 'w2', d: '2026-10-05', start: 2, entries: [], media: [ref(2)] }],
    })
    const host = render(<Body />)
    const items = host.querySelectorAll('.body-photos button.wmedia-item')
    expect(items).toHaveLength(2)
    expect(items[1].textContent).toContain('81 kg')
    expect(items[0].textContent).not.toContain('kg')
    act(() => { items[0].click() })
    expect(useUI.getState().sheets.at(-1).kind).toBe('viewer')
  })
})

const D = '2026-11-01'
const FOLDS = { skChest: 20, skMidaxillary: 15, skTriceps: 10, skSubscapular: 15, skAbdominal: 20, skSuprailiac: 10, skThigh: 10 }
const assessed = (over = {}) => ({
  sex: 'm', birthDate: '1996-03-10', heightCm: 175,
  bodyweight: [{ d: D, w: 80, t: 1 }],
  measurements: [{ d: D, t: 1, ...FOLDS, bnWrist: 5.6, bnFemur: 9.5 }],
  ...over,
})
const rowOf = (host, selector) => host.querySelector(selector).closest('.row')
const clickIn = (el, text) => act(() => { [...el.querySelectorAll('button')].find(b => b.textContent.trim() === text).click() })

describe('the Advanced tab', () => {
  it('empty: the invitation and the switch, nothing broken', () => {
    seed()
    const host = render(<Body />, '/body?tab=advanced')
    expect(host.textContent).toContain('Log your skinfolds to estimate your body fat and body composition.')
    expect(button(host, 'Turn on skinfolds and bones')).toBeTruthy()
    expect(host.textContent).not.toMatch(/NaN|null|undefined/)
  })

  it('the switch turns on the 13 fields without touching the others, then goes away', () => {
    seed({ measurementEnabled: ['waist', 'skChest'] })
    const host = render(<Body />, '/body?tab=advanced')
    click(host, 'Turn on skinfolds and bones')
    const on = S().measurementEnabled
    expect(on).toContain('waist')
    for (const k of ADVANCED_MEASUREMENT_KEYS) expect(on).toContain(k)
    expect(on).toHaveLength(14)
    expect(button(host, 'Turn on skinfolds and bones')).toBeFalsy()
  })

  it('shows both body fats, the advanced composition and the ideal range', () => {
    seed(assessed())
    const host = render(<Body />, '/body?tab=advanced')
    expect(host.textContent).toContain('14.6')
    expect(host.textContent).toContain('15.1')
    expect(host.querySelector('.chart svg')).not.toBeNull()
    const a = assessmentOf(S(), D)
    for (const part of ['fat', 'bone', 'residual', 'muscle']) expect(host.textContent).toContain(fmtNum(a.advanced[part]) + ' kg')
    expect(host.textContent).toContain('Muscle mass')
    expect(host.textContent).toContain('56.7 kg')
    expect(host.textContent).toContain('76.3 kg')
    expect(host.textContent).toContain('Your latest weight is above this range')
    expect(host.textContent).not.toMatch(/NaN|null|undefined/)
  })

  it('without a sex says so and shows no body fat', () => {
    seed(assessed({ sex: null }))
    const host = render(<Body />, '/body?tab=advanced')
    expect(host.textContent).toContain('Enter your sex in the Diagnosis card')
    expect(host.textContent).not.toContain('14.6')
    expect(host.textContent).not.toContain('Jackson and Pollock 7 skinfolds')
  })

  it('with skinfolds logged but no sex and no height it says what is missing, not the invitation', () => {
    seed(assessed({ sex: null, heightCm: null }))
    const host = render(<Body />, '/body?tab=advanced')
    expect(host.textContent).toContain('Enter your sex in the Diagnosis card')
    expect(host.textContent).toContain('Enter your height')
    expect(host.textContent).not.toContain('Log your skinfolds to estimate your body fat and body composition.')
  })

  it('on an lb profile the ideal weight is in lb', () => {
    seed(assessed({ unit: 'lb', bodyweight: [{ d: D, w: 176.4, t: 1 }] }))
    const host = render(<Body />, '/body?tab=advanced')
    expect(host.textContent).toContain('125 lb')
    expect(host.textContent).toContain('168.2 lb')
    expect(host.textContent).not.toMatch(/NaN|null|undefined/)
  })

  it('compares the newest weigh-in by date, whatever the stored order', () => {
    seed(assessed({ bodyweight: [{ d: D, w: 80, t: 2 }, { d: '2026-10-01', w: 60, t: 1 }] }))
    const host = render(<Body />, '/body?tab=advanced')
    expect(host.textContent).toContain('Your latest weight is above this range')
  })

  it('in lb, a weigh-in equal to the shown minimum (125 lb for 175 cm) is within the range', () => {
    seed(assessed({ unit: 'lb', bodyweight: [{ d: D, w: 125, t: 1 }] }))
    const host = render(<Body />, '/body?tab=advanced')
    expect(host.textContent).toContain('125 lb')
    expect(host.textContent).toContain('Your latest weight is within this range')
  })

  it('switching to it writes ?tab=advanced', () => {
    seed()
    const host = render(<Body />)
    click(host, 'Advanced')
    expect(where.search).toBe('?tab=advanced')
  })
})

describe('the Diagnosis card: sex and birth date', () => {
  it('Female writes sex f; tapping it again writes nothing', () => {
    seed()
    const host = render(<Body />)
    expect(button(host, 'Female').getAttribute('aria-pressed')).toBe('false')
    click(host, 'Female')
    expect(S().sex).toBe('f')
    expect(button(host, 'Female').getAttribute('aria-pressed')).toBe('true')
    const before = S()
    click(host, 'Female')
    expect(S()).toBe(before)
  })

  it('saves a birth date and refuses a future one', () => {
    seed()
    let host = render(<Body />)
    setValue(host.querySelector('input[type=date]'), '1996-03-10')
    clickIn(rowOf(host, 'input[type=date]'), 'Save')
    expect(S().birthDate).toBe('1996-03-10')

    seed()
    host = render(<Body />)
    setValue(host.querySelector('input[type=date]'), '2999-01-01')
    clickIn(rowOf(host, 'input[type=date]'), 'Save')
    expect(toast()).toBe('Enter a valid birth date')
    expect(S().birthDate).toBe(null)
  })

  it('Edit then Save with the same birth date writes nothing', () => {
    seed({ heightCm: 180, birthDate: '1996-03-10' })
    const host = render(<Body />)
    const before = S()
    act(() => { [...host.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Edit').at(-1).click() })
    expect(host.querySelector('input[type=date]').value).toBe('1996-03-10')
    clickIn(rowOf(host, 'input[type=date]'), 'Save')
    expect(S()).toBe(before)
    expect(host.querySelector('input[type=date]')).toBeNull()
  })
})
