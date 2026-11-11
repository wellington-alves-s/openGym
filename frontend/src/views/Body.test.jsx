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
    expect(host.textContent).toContain('Body measurements')
    click(host, 'Weight')
    expect(where.search).toBe('?tab=weight')
    expect(host.textContent).not.toContain('Body measurements')
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
