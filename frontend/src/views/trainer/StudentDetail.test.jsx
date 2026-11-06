// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StudentDetail from './StudentDetail.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* One student: name and state, and for a student who joined, the Training card with the published
   version, whether the draft has changes, and the ways to edit, publish and browse versions. */
const mocks = vi.hoisted(() => ({ listStudents: vi.fn(), getRx: vi.fn(), openSheet: vi.fn(), toast: vi.fn() }))
vi.mock('../../lib/trainer-api.js', () => ({
  listStudents: (...a) => mocks.listStudents(...a), getRx: (...a) => mocks.getRx(...a),
}))
vi.mock('../../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: (...a) => mocks.openSheet(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../../components/PublishSheet.jsx', () => ({ default: () => null, rxErrorText: () => '' }))
vi.mock('../../components/VersionsSheet.jsx', () => ({ default: () => null, dateOf: () => '5 Oct 2026' }))

const T = Date.UTC(2026, 9, 5, 12)
const bia = { id: 'b2', name: 'Bia', status: 'active', created: T, linkedAt: T }
const ana = { id: 'a1', name: 'Ana', status: 'invited', created: T, linkedAt: null }
const bundle = (ex = 1) => ({ opengym_plan: 1, unit: 'kg', week: {}, routines: [{ id: 'r1', name: 'Push', ex: Array.from({ length: ex }, () => ({ id: '0025' })) }], customEx: [] })
const rx = ({ updated = T + 1000, current = 2, ex = 1 } = {}) => ({ rx: {
  _rev: 4, draft: { bundle: bundle(ex), updated }, current,
  versions: current ? [{ v: 1, at: T - 1000, note: '' }, { v: 2, at: T, note: 'x' }] : [],
} })

let host, root
function mount(path = '/students/b2') {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/students/:sid" element={<StudentDetail />} />
      <Route path="/students/:sid/plan" element={<p>the plan</p>} />
      <Route path="/students" element={<p>the list</p>} />
    </Routes>
  </MemoryRouter>))
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
const buttons = () => [...host.querySelectorAll('.card button')].map(b => b.textContent)
const press = text => act(() => [...host.querySelectorAll('button')].find(b => b.textContent === text).click())

beforeEach(() => { for (const k of Object.keys(mocks)) mocks[k].mockReset() })
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('StudentDetail', () => {
  it('shows the published version, that the draft has changes, and the three actions', async () => {
    mocks.listStudents.mockResolvedValue([ana, bia])
    mocks.getRx.mockResolvedValue(rx())
    mount(); await settle()
    expect(mocks.getRx).toHaveBeenCalledWith('b2')
    expect(host.querySelector('h2').textContent).toBe('Bia')
    expect(host.textContent).toContain('Active')
    expect(host.textContent).toContain('Training')
    expect(host.textContent).toContain('Version 2, published 5 Oct 2026')
    expect(host.textContent).toContain('Draft has changes')
    expect(buttons()).toEqual(['Edit plan', 'Publish', 'Versions'])
  })

  it('says nothing about the draft when it is what was published, and says when nothing is', async () => {
    mocks.listStudents.mockResolvedValue([bia])
    mocks.getRx.mockResolvedValue(rx({ updated: T - 5 }))
    mount(); await settle()
    expect(host.textContent).not.toContain('Draft has changes')
    act(() => root.unmount()); host.remove()
    mocks.getRx.mockResolvedValue(rx({ current: null, updated: 0 }))
    mount(); await settle()
    expect(host.textContent).toContain('Not published yet')
    expect(host.textContent).not.toContain('Draft has changes')
  })

  it('Edit plan opens the plan, Publish and Versions open their sheets', async () => {
    mocks.listStudents.mockResolvedValue([bia])
    mocks.getRx.mockResolvedValue(rx())
    mount(); await settle()
    press('Publish'); press('Versions')
    expect(mocks.openSheet).toHaveBeenCalledTimes(2)
    press('Edit plan')
    expect(host.textContent).toContain('the plan')
  })

  it('a student who has not joined gets the explanation and no actions', async () => {
    mocks.listStudents.mockResolvedValue([ana])
    mount('/students/a1'); await settle()
    expect(host.textContent).toContain('This student has not joined yet')
    expect(host.textContent).toContain('Invite pending')
    expect(buttons()).toEqual([])
    expect(mocks.getRx).not.toHaveBeenCalled()
  })

  it('a student who is not on the list sends the trainer back to the list', async () => {
    mocks.listStudents.mockResolvedValue([bia])
    mount('/students/zz'); await settle()
    expect(host.textContent).toContain('the list')
  })
})
