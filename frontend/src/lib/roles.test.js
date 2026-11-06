import { describe, expect, it } from 'vitest'
import { roleOf, isTrainer, isApprovedTrainer, isPendingTrainer, isStudent, homeFor, tabsFor } from './roles.js'

const users = {
  nobody: null,
  missing: undefined,
  plain: { id: 'u1', name: 'Ana' },
  student: { id: 'u2', name: 'Bo', role: 'student' },
  pending: { id: 'u3', name: 'Cy', role: 'trainer', trainerStatus: 'pending' },
  approved: { id: 'u4', name: 'Di', role: 'trainer', trainerStatus: 'approved' },
  disabled: { id: 'u5', name: 'Ed', role: 'trainer', trainerStatus: 'disabled' }
}

describe('role predicates', () => {
  // [user, role, isTrainer, isApprovedTrainer, isPendingTrainer, isStudent]
  const table = [
    ['nobody', null, false, false, false, false],
    ['missing', null, false, false, false, false],
    ['plain', null, false, false, false, false],
    ['student', 'student', false, false, false, true],
    ['pending', 'trainer', true, false, true, false],
    ['approved', 'trainer', true, true, false, false],
    ['disabled', 'trainer', true, false, false, false]
  ]
  it.each(table)('%s', (key, role, trainer, approved, pending, student) => {
    const u = users[key]
    expect(roleOf(u)).toBe(role)
    expect(isTrainer(u)).toBe(trainer)
    expect(isApprovedTrainer(u)).toBe(approved)
    expect(isPendingTrainer(u)).toBe(pending)
    expect(isStudent(u)).toBe(student)
  })

  it('ignores a role it does not know', () => {
    expect(roleOf({ role: 'admin' })).toBe(null)
  })
})

describe('homeFor', () => {
  it('sends an approved trainer to the students, a pending one to the waiting page, the rest home', () => {
    expect(homeFor(users.approved)).toBe('/students')
    expect(homeFor(users.pending)).toBe('/pending')
    for (const k of ['nobody', 'plain', 'student', 'disabled']) expect(homeFor(users[k])).toBe('/home')
  })
})

describe('tabsFor', () => {
  it('gives an approved trainer a students tab, a models tab and a profile tab, in that order', () => {
    expect(tabsFor(users.approved)).toEqual([
      { key: 'students', path: '/students', icon: 'person', label: 'Students' },
      { key: 'models', path: '/models', icon: 'clipboard', label: 'Models' },
      { key: 'profile', path: '/settings', icon: 'gear', label: 'Profile' }
    ])
  })

  it('leaves everyone else the current bar', () => {
    for (const k of ['nobody', 'plain', 'student', 'pending', 'disabled']) expect(tabsFor(users[k])).toEqual([])
  })
})
