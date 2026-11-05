// @vitest-environment happy-dom
// The trainer card in the admin page: there with trainer mode on, and not at all with it off, so the
// page is exactly what it was for an instance that never turned the mode on (Admin.test.jsx).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Admin from './Admin.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ config: null, answers: {} }))
vi.mock('../lib/api.js', () => ({
  api: path => {
    const key = path.split('?')[0]
    return key in mocks.answers ? Promise.resolve(mocks.answers[key]) : Promise.reject(new Error('not found'))
  }
}))
vi.mock('../lib/trainer-api.js', () => ({
  listTrainers: () => Promise.resolve([{ id: 'p1', name: 'Rita', status: 'pending', created: 0, students: 0 }]),
  approveTrainer: vi.fn(), rejectTrainer: vi.fn(), setTrainerMode: vi.fn(),
}))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ user: { id: 'adm', name: 'Admin', admin: true }, S: {}, config: mocks.config, setUser: () => {} })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: () => {}, openSheet: () => {} })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {}, useLocation: () => ({ state: null }) }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: vi.fn() }))
vi.mock('./AdminCoach.jsx', () => ({ default: () => null }))

const mounted = []
function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))

beforeEach(() => {
  document.body.innerHTML = ''
  mocks.config = null
  mocks.answers = {
    '/api/admin/users': { users: [{ id: 'adm', name: 'Admin', admin: true, owner: true, workouts: 0 }], invite_only: false },
    '/api/admin/invites': { invites: [] },
    '/api/admin/audit': { events: [], enabled: true, total: 0, retention: {} },
  }
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Admin trainer card', () => {
  it('is on the page with trainer mode on, with the owner\'s controls', async () => {
    mocks.config = { trainer_mode: true }
    const page = render(<Admin />)
    await settle()
    expect(page.textContent).toContain('Personal trainers')
    expect(page.textContent).toContain('Rita')
    expect(page.querySelector('[aria-label="Approve Rita"]')).toBeTruthy()
    expect(page.querySelector('[aria-label="Trainer mode on my account"]')).toBeTruthy()
  })

  it('is not on the page with trainer mode off', async () => {
    const page = render(<Admin />)
    await settle()
    expect(page.textContent).not.toContain('Personal trainers')
    expect(page.textContent).toContain('Invite codes')
  })
})
