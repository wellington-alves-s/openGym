// @vitest-environment happy-dom
// An approved trainer's bar is two tabs (lib/roles.js tabsFor) and no start-workout button; every
// other account keeps the bar it has (TabBar.test.jsx).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.jsx'
import { DEF, useStore } from '../store/useStore.js'

const where = vi.hoisted(() => ({ loc: { pathname: '/students' }, go: vi.fn() }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => where.go,
  useLocation: () => where.loc,
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, originalS, originalUser

beforeEach(() => {
  const store = useStore.getState()
  originalS = store.S
  originalUser = store.user
  useStore.setState({ S: JSON.parse(JSON.stringify(DEF)) })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState({ S: originalS, user: originalUser })
  where.loc = { pathname: '/students' }
  where.go.mockReset()
})

const tabs = () => [...host.querySelectorAll('#tabbar button')]
const as = user => { useStore.setState({ user }); act(() => { root.render(<TabBar onStart={() => {}} />) }) }
const approved = { id: 't1', name: 'Carla', role: 'trainer', trainerStatus: 'approved' }

describe('the approved trainer bar', () => {
  it('has Students and Profile and no start button', () => {
    as(approved)
    expect(tabs().map(b => b.textContent)).toEqual(['Students', 'Profile'])
    expect(host.querySelector('#tabbar .start')).toBeNull()
    expect(tabs().map(b => b.querySelector('svg')?.getAttribute('data-icon'))).toEqual(['person', 'gear'])
  })

  it('lights Students on /students and Profile on every settings page', () => {
    as(approved)
    expect(tabs().map(b => b.className)).toEqual(['on', ''])
    where.loc = { pathname: '/settings/units' }
    as(approved)
    expect(tabs().map(b => b.className)).toEqual(['', 'on'])
  })

  it('goes to the tab path', () => {
    where.loc = { pathname: '/settings' }
    as(approved)
    act(() => tabs()[0].click())
    expect(where.go).toHaveBeenCalledWith('/students', { replace: true })
  })
})

describe('everyone else keeps the bar they have', () => {
  it.each([
    ['a student', { id: 's1', name: 'Lee', role: 'student' }],
    ['an account with no role', { id: 'u1', name: 'Lee' }],
    ['a trainer waiting for approval', { id: 't2', name: 'Bo', role: 'trainer', trainerStatus: 'pending' }],
  ])('%s', (_, user) => {
    where.loc = { pathname: '/home' }
    as(user)
    expect(tabs().map(b => b.textContent)).toEqual(['Home', 'Plan', 'Start', 'Stats', 'Exercises'])
  })
})
