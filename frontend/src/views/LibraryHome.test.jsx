// @vitest-environment happy-dom
// The Exercises tab opens on the muscle explorer; "List" swaps to the flat Library and its
// "By muscle" button swaps back.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LibraryHome from './LibraryHome.jsx'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null }
  state.snapshot = () => ({ S: state.S, user: null, update: () => {} })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({ exerciseDetailSheet: vi.fn(), addToRoutineSheet: vi.fn(), customExSheet: vi.fn() }))

const mounted = []
const btn = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)

beforeEach(() => {
  mocks.S = { unit: 'kg', lang: 'en', routines: [], workouts: [], customEx: [], exWeights: {}, equipProfiles: [], activeEquipId: null, equipFilterOn: false }
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('LibraryHome', () => {
  it('names the muscles on the figure and Rotate turns it to the back', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push(root)
    act(() => root.render(<LibraryHome />))
    await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector('.bm-name')).not.toBeNull() })   // the outlines load on first render
    const names = () => [...host.querySelectorAll('.bm-name')].map(b => b.textContent)
    expect(names()).toContain('Chest')
    expect(names()).not.toContain('Glutes')
    act(() => btn(host, 'Rotate').click())
    expect(names()).toContain('Glutes')
    expect(names()).not.toContain('Chest')
    act(() => [...host.querySelectorAll('.bm-name')].find(b => b.textContent === 'Glutes').click())
    expect(host.textContent).toContain('Exercises for Glutes')
    expect(host.querySelector('.list').classList.contains('ex-grid')).toBe(true)   // picture cards, whatever the list/cards setting
    expect(host.querySelector('button[aria-label="Cards"]')).toBeNull()
    act(() => btn(host, 'Alphabetical').click())
    const shown = [...host.querySelectorAll('.list .item .tt')].map(e => e.textContent)
    expect(shown.length).toBeGreaterThan(1)
    expect(shown).toEqual([...shown].sort((x, y) => x.localeCompare(y)))
  })

  it('takes several muscles and several equipment types, each from its sheet', async () => {
    useUI.setState({ sheets: [] })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push(root)
    act(() => root.render(<LibraryHome />))
    await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector('.bm-name')).not.toBeNull() })
    const nameBtn = label => [...host.querySelectorAll('.bm-name')].find(b => b.textContent === label)
    act(() => nameBtn('Chest').click())
    act(() => btn(host, 'Rotate').click())
    act(() => nameBtn('Glutes').click())
    expect(host.textContent).toContain('Exercises for Chest, Glutes')
    const itemsFor = () => host.querySelectorAll('.list .item').length
    // the muscle sheet: untick Chest, tick Triceps; the heading follows, in the map's order
    act(() => btn(host, 'Muscle groups (2)').click())
    const sheetHost = () => { const h = document.createElement('div'); document.body.appendChild(h); const r = createRoot(h); mounted.push(r); const top = useUI.getState().sheets.at(-1); act(() => r.render(top.render(() => useUI.getState().closeSheet(top.id)))); return h }
    let sh = sheetHost()
    act(() => btn(sh, 'Chest').click())
    act(() => btn(sh, 'Triceps').click())
    act(() => btn(sh, 'Apply').click())
    expect(host.textContent).toContain('Exercises for Triceps, Glutes')
    // equipment: two types narrow the list to exactly those two
    const before = itemsFor()
    act(() => btn(host, 'Equipment').click())
    sh = sheetHost()
    const opts = [...sh.querySelectorAll('.lrow')].map(b => b.textContent.trim())
    expect(opts.length).toBeGreaterThan(2)
    act(() => btn(sh, opts[0]).click())
    act(() => btn(sh, opts[1]).click())
    act(() => btn(sh, 'Apply').click())
    expect(btn(host, 'Equipment (2)')).toBeDefined()
    const kinds = new Set([...host.querySelectorAll('.list .item .ss')].map(e => e.textContent.split(' · ').pop().trim().toLowerCase()))
    expect([...kinds].every(k => [opts[0], opts[1]].map(o => o.toLowerCase()).includes(k))).toBe(true)
    expect(itemsFor()).toBeLessThanOrEqual(before)
  })

  it('starts on the muscle explorer and toggles to the list and back', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push(root)
    act(() => root.render(<LibraryHome />))
    expect(host.querySelector('.search-row')).toBeNull()      // no list search until a muscle is chosen
    expect(btn(host, 'By muscle')).toBeUndefined()
    act(() => btn(host, 'List').click())
    expect(host.querySelector('.search-row')).not.toBeNull()
    act(() => btn(host, 'By muscle').click())
    expect(btn(host, 'List')).toBeDefined()
  })
})
