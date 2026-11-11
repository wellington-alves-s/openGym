// @vitest-environment happy-dom
/* The Register sheet of the Body screen: one check-in per date with the day's weight, photos,
 * measurements and a note, saved together (lib/body-checkin.js). */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', async importOriginal => ({ ...(await importOriginal()), api: vi.fn(() => Promise.reject(new Error('offline'))), beacon: vi.fn() }))
vi.mock('../lib/media-sync.js', () => ({ syncMedia: vi.fn() }))
const photoRef = { kind: 'image', hash: '7'.padStart(64, '0'), mime: 'image/jpeg', size: 10, width: 4, height: 3, at: 1 }
const ref = n => ({ ...photoRef, hash: String(n).padStart(64, '0') })
// What the picker does with a file; a test swaps it for one that fails, as the real one toasts then.
let mockPick = async () => photoRef
vi.mock('./CustomMediaField.jsx', () => ({
  useMediaPicker: () => ({ pick: (...a) => mockPick(...a), busy: false, canAdd: true, showAdd: true }),
}))

import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { syncMedia } from '../lib/media-sync.js'
import { bodyCheckinSheet } from './BodyCheckinSheet.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
const mounted = []
function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<MemoryRouter>{el}</MemoryRouter>))
  return host
}
const topSheet = () => { const s = useUI.getState().sheets.at(-1); return s ? render(s.render(() => useUI.getState().closeSheet(s.id))) : null }
const setValue = (input, v) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const field = (host, label) => [...host.querySelectorAll('.measure-field')].find(l => l.textContent.startsWith(label))?.querySelector('input')
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.getAttribute('aria-label') === text)
const click = (host, text) => act(() => { button(host, text).click() })
const save = async host => { await act(async () => { button(host, 'Save').click() }) }
const weightInput = host => host.querySelector('.checkin-weight input')
const noteInput = host => host.querySelector('.checkin-note input')
const dateInput = host => host.querySelector('.measure-date input')
const toast = () => useUI.getState().toastMsg
const S = () => useStore.getState().S
const open = () => useUI.getState().sheets.length

function seed(extra = {}) {
  useStore.setState({ S: Object.assign(clone(DEF), { unit: 'kg', measurementEnabled: ['waist', 'bodyFat'], measurements: [], bodyweight: [] }, extra), user: null, config: null })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useUI.setState({ sheets: [], toastMsg: '' })
  document.body.innerHTML = ''
  syncMedia.mockClear()
  mockPick = async () => photoRef
})
const choosePhoto = (form, name = 'front.jpg') => {
  const input = form.querySelector('input[type=file]')
  Object.defineProperty(input, 'files', { value: [new File(['x'], name, { type: 'image/jpeg' })], configurable: true })
  act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
}
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('the Register sheet', () => {
  it('saves a weight for today on an empty profile and closes', async () => {
    seed()
    act(() => bodyCheckinSheet())
    const form = topSheet()
    expect(form.textContent).toContain('Check-in')
    setValue(weightInput(form), '80')
    await save(form)
    expect(S().bodyweight).toMatchObject([{ d: todayISO(), w: 80 }])
    expect(open()).toBe(0)
    expect(toast()).toBe('Check-in saved')
  })

  it('loads what a date holds, and changing to an empty date clears the fields', () => {
    seed({ bodyweight: [{ d: '2026-01-05', w: 81.5, t: 1 }], measurements: [{ d: '2026-01-05', waist: 84, t: 1 }], bodyNotes: { '2026-01-05': { text: 'felt light', _ts: 1 } } })
    act(() => bodyCheckinSheet('2026-01-05'))
    const form = topSheet()
    expect(form.textContent).toContain('Edit check-in')
    expect(weightInput(form).value).toBe('81.5')
    expect(noteInput(form).value).toBe('felt light')
    expect(field(form, 'Waist').value).toBe('84')
    setValue(dateInput(form), '2026-01-06')
    expect(weightInput(form).value).toBe('')
    expect(noteInput(form).value).toBe('')
    expect(field(form, 'Waist')).toBeUndefined()      // no measurements there: folded again
    click(form, 'Measurements')
    expect(field(form, 'Waist').value).toBe('')
  })

  it('saves a note alone into bodyNotes', async () => {
    seed()
    act(() => bodyCheckinSheet())
    const form = topSheet()
    setValue(noteInput(form), 'slept badly')
    await save(form)
    expect(S().bodyNotes[todayISO()].text).toBe('slept badly')
    expect(S().dayNotes?.[todayISO()]).toBeUndefined()
    expect(open()).toBe(0)
  })

  it('an empty form shows a toast and stays open', async () => {
    seed()
    act(() => bodyCheckinSheet())
    const form = topSheet()
    await save(form)
    expect(toast()).toBe('Fill in at least one item')
    expect(open()).toBe(1)
  })

  it('a weight of 800 kg is refused and nothing is written', async () => {
    seed()
    act(() => bodyCheckinSheet())
    const form = topSheet()
    setValue(weightInput(form), '800')
    setValue(noteInput(form), 'oops')
    await save(form)
    expect(toast()).toBe('That looks too heavy. Keep it at 700 kg or less.')
    expect(S().bodyweight).toEqual([])
    expect(S().bodyNotes?.[todayISO()]).toBeUndefined()
    expect(open()).toBe(1)
  })

  it('a chosen photo with nothing else saves only the photo', async () => {
    seed()
    act(() => bodyCheckinSheet())
    const form = topSheet()
    const file = new File(['x'], 'front.jpg', { type: 'image/jpeg' })
    const input = form.querySelector('input[type=file]')
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(form.textContent).toContain('front.jpg')
    await save(form)
    expect(S().dayPhotos[photoRef.hash]).toMatchObject({ d: todayISO() })
    expect(S().bodyweight).toEqual([])
    expect(syncMedia).toHaveBeenCalledWith({ force: true })
    expect(open()).toBe(0)
    expect(toast()).toBe('Check-in saved')
  })

  it('the Measurements section starts folded and shows the active fields once opened', () => {
    seed()
    act(() => bodyCheckinSheet())
    const form = topSheet()
    expect(field(form, 'Waist')).toBeUndefined()
    click(form, 'Measurements')
    expect(field(form, 'Waist')).toBeTruthy()
    expect(field(form, 'Body fat')).toBeTruthy()
  })

  it('in lb, saving a weight leaves an untouched measurement at its exact stored cm', async () => {
    seed({ unit: 'lb', measurements: [{ d: todayISO(), waist: 80.1, t: 1 }] })
    act(() => bodyCheckinSheet())
    const form = topSheet()
    expect(field(form, 'Waist').value).toBe('31.5')
    setValue(weightInput(form), '180')
    await save(form)
    expect(S().bodyweight).toMatchObject([{ d: todayISO(), w: 180 }])
    expect(S().measurements[0].waist).toBe(80.1)
  })

  it('opens on a date with measurements with the Measurements section already open', () => {
    seed({ measurements: [{ d: '2026-01-05', waist: 84, t: 1 }] })
    act(() => bodyCheckinSheet('2026-01-05'))
    const form = topSheet()
    expect(field(form, 'Waist').value).toBe('84')
  })

  it('a weight with a photo the picker could not read saves the weight and leaves the picker error', async () => {
    seed()
    mockPick = async () => { useUI.getState().toast('Could not read that file'); return null }
    act(() => bodyCheckinSheet())
    const form = topSheet()
    setValue(weightInput(form), '80')
    choosePhoto(form)
    await save(form)
    expect(S().bodyweight).toMatchObject([{ d: todayISO(), w: 80 }])
    expect(open()).toBe(0)
    expect(toast()).not.toBe('Check-in saved')
    expect(toast()).toBe('Could not read that file')
  })

  it('a photo the day already has says so, and the sheet stays open', async () => {
    seed({ dayPhotos: { [photoRef.hash]: { d: todayISO(), m: photoRef, _ts: 1 } } })
    act(() => bodyCheckinSheet())
    const form = topSheet()
    choosePhoto(form)
    await save(form)
    expect(toast()).toBe('That photo is already on this day')
    expect(open()).toBe(1)
  })

  it('shows how many photos the date holds, as an existing check-in, and follows the date', () => {
    seed({ dayPhotos: { [ref(1).hash]: { d: '2026-01-05', m: ref(1), _ts: 1 }, [ref(2).hash]: { d: '2026-01-05', m: ref(2), _ts: 1 } } })
    act(() => bodyCheckinSheet('2026-01-05'))
    const form = topSheet()
    expect(form.textContent).toContain('2 photos')
    expect(form.querySelector('h3').textContent).toBe('Edit check-in')
    setValue(dateInput(form), '2026-01-06')
    expect(form.textContent).not.toContain('2 photos')
    expect(form.querySelector('h3').textContent).toBe('Check-in')
  })
})
