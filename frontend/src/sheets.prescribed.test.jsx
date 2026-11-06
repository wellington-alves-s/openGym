// @vitest-environment happy-dom
// "Add to my plan" on an exercise lists the student's own routines only: a trainer's routine
// (rx) is not theirs to add to.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { addToRoutineSheet } from './sheets.jsx'
import { EXDB } from './lib/exercises.js'

const mounted = []
const ex = EXDB.find(e => e.bp !== 'cardio')

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  document.body.innerHTML = ''
  const S = JSON.parse(JSON.stringify(useStore.getState().S))
  S.routines = [{ id: 'own', name: 'My push', emoji: null, ex: [] }, { id: 'rx-1', name: 'Coach A', emoji: null, ex: [], rx: { v: 1 } }]
  useStore.setState({ S, user: null })
})
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()) }) })

describe('Add to my plan', () => {
  it('offers the student’s own routines, not the prescribed one', () => {
    addToRoutineSheet(ex)
    const sheet = useUI.getState().sheets.at(-1)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    mounted.push(root)
    act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
    const names = [...host.querySelectorAll('.item .tt')].map(n => n.textContent)
    expect(names).toContain('My push')
    expect(names).not.toContain('Coach A')
  })
})
