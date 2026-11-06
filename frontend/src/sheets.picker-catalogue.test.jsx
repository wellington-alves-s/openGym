// @vitest-environment happy-dom
// Stage 2a: a trainer builds a student's plan with the normal editor, and the student's app does
// not have the trainer's own exercises. `catalogueOnly` keeps every one of them out of the picker.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { registerCustom } from './lib/exercises.js'
import { exercisePicker } from './sheets.jsx'

const mounted = []
const CUSTOM = { id: 'cx1', n: 'zorblax pull', bp: 'back', tg: 'lats', eq: 'custom', custom: true, desc: '' }

function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const chip = (host, text) => [...host.querySelectorAll('.chips .chip')].find(b => b.textContent.trim().startsWith(text))
const names = host => [...host.querySelectorAll('.list .item .tt')].map(e => e.textContent)
const hasCustom = host => names(host).some(n => n.includes('zorblax')) || host.textContent.includes('zorblax')

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ S: { ...structuredClone(DEF), customEx: [CUSTOM], favEx: ['cx1', '0025'], workouts: [{ id: 'w1', d: '2026-09-01', start: 1, end: 2, name: 'x', entries: [{ id: 'cx1', sets: [{ w: 10, r: 8, done: true }] }] }] }, user: null })
  registerCustom([CUSTOM])
  document.body.innerHTML = ''
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach(root => root.unmount()) })
  registerCustom([])
})

describe('exercise picker, catalogue only', () => {
  it('by default shows the create row and the custom exercise', () => {
    exercisePicker(vi.fn())
    const host = renderTop()
    expect(host.querySelector('.ex-new')).toBeTruthy()
    type(host.querySelector('input.input'), 'zorblax')
    expect(hasCustom(host)).toBe(true)
  })

  it('shows neither the create row nor the custom exercise, and a catalogue one is still pickable', () => {
    const onPick = vi.fn()
    exercisePicker(onPick, { catalogueOnly: true })
    const host = renderTop()
    expect(host.querySelector('.ex-new')).toBeNull()
    expect(hasCustom(host)).toBe(false)
    act(() => host.querySelector('.list .item').click())
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0].custom).toBeFalsy()
  })

  it('a search for the custom exercise’s name finds nothing, not even as a near match', () => {
    exercisePicker(vi.fn(), { catalogueOnly: true })
    const host = renderTop()
    type(host.querySelector('input.input'), 'zorblax pull')
    expect(hasCustom(host)).toBe(false)
  })

  it('the Chosen and Favourites views and their counts leave it out', () => {
    exercisePicker(vi.fn(), { catalogueOnly: true })
    const host = renderTop()
    expect(chip(host, 'Chosen')).toBeUndefined()
    expect(chip(host, 'Favourites').textContent).toContain('(1)')
    act(() => chip(host, 'Favourites').click())
    expect(hasCustom(host)).toBe(false)
  })

  it('a swap away from a custom exercise opens on no same-muscle list and lists no custom one', () => {
    exercisePicker(vi.fn(), { catalogueOnly: true, like: 'cx1', backups: ['cx1'] })
    const host = renderTop()
    expect(hasCustom(host)).toBe(false)
  })

  it('the By muscle view leaves it out', () => {
    exercisePicker(vi.fn(), { catalogueOnly: true })
    const host = renderTop()
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent.includes('By muscle')).click())
    act(() => chip(host, 'Lats & upper back').click())
    expect(hasCustom(host)).toBe(false)
    expect(host.querySelectorAll('.list .item').length).toBeGreaterThan(0)
  })
})
