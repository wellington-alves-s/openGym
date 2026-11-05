// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageVisible, searchSettings } from './settings-pages.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* "My trainer" is a Settings page for a student who has a trainer, and for nobody else. */
const mocks = vi.hoisted(() => {
  const state = { user: null, navs: [] }
  state.snapshot = () => ({
    S: { unit: 'kg', restSec: 90, lang: 'en', workouts: [], routines: [], exWeights: {}, reminder: { on: false, time: '17:30' } },
    user: state.user, coachLocal: null, sync: null, config: null,
    update: vi.fn(), replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(), setUnit: vi.fn(),
    resetEverything: vi.fn(), resetDemo: vi.fn(), importBackup: vi.fn(), importConflict: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => (...a) => mocks.navs.push(a) }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})), webauthnOK: () => false, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false }))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn(), syncPushSubscription: vi.fn(() => Promise.resolve(false)) }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => true }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), shareExportBlob: vi.fn(), syncReminder: vi.fn() }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('./MyTrainer.jsx', () => ({ default: () => <div>the my trainer screen</div> }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(), importFromHevy: vi.fn(),
  equipmentProfileSheet: vi.fn(), plateInventorySheet: vi.fn(), menuSheet: vi.fn(),
}))

import Settings from './Settings.jsx'

globalThis.__APP_VERSION__ ??= 'test'

let host, root
beforeEach(() => {
  mocks.user = null
  mocks.navs = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const mount = (page = null) => act(() => root.render(<Settings page={page} />))
const rowTitled = title => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)

describe('the My trainer row', () => {
  it('is there for a student with a trainer, with the trainer name, and opens the page', () => {
    mocks.user = { id: 'u1', name: 'Ana', role: 'student', trainer: { name: 'Rui' } }
    mount()
    const row = rowTitled('My trainer')
    expect(row.querySelector('.lrow-v').textContent).toBe('Rui')
    act(() => row.click())
    expect(mocks.navs).toEqual([['/settings/my-trainer']])
  })

  it('is not there for a student without a trainer, a trainer, a user with no role, or a guest', () => {
    for (const user of [
      { id: 'u1', name: 'Ana', role: 'student' },
      { id: 'u2', name: 'Rui', role: 'trainer', trainerStatus: 'approved', trainer: { name: 'Rui' } },
      { id: 'u3', name: 'Dana' },
      null,
    ]) {
      mocks.user = user
      mount()
      expect(rowTitled('My trainer'), JSON.stringify(user)).toBeUndefined()
      expect(pageVisible('my-trainer', { user })).toBe(false)
      expect(searchSettings('trainer', { user }, s => s).map(h => h.title)).not.toContain('My trainer')
    }
  })

  it('the page has the usual back button and title around the screen', () => {
    mocks.user = { id: 'u1', name: 'Ana', role: 'student', trainer: { name: 'Rui' } }
    mount('my-trainer')
    expect(host.querySelector('.sp-back').getAttribute('data-back')).toBe('/settings')
    expect(host.querySelector('.sp-title').textContent).toBe('My trainer')
    expect(host.textContent).toContain('the my trainer screen')
  })
})
