// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModelPickerSheet from './ModelPickerSheet.jsx'
import SaveModelSheet from './SaveModelSheet.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Use a model lists the trainer's models and hands the one chosen to the program view; Save as
   model keeps a month's plan under a name. */
const mocks = vi.hoisted(() => ({ listModels: vi.fn(), getModel: vi.fn(), createModel: vi.fn(), toast: vi.fn() }))
vi.mock('../lib/trainer-api.js', () => ({
  listModels: (...a) => mocks.listModels(...a), getModel: (...a) => mocks.getModel(...a), createModel: (...a) => mocks.createModel(...a),
}))
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
function type(el, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const submit = async host => { act(() => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }); await settle() }
const bundle = { opengym_plan: 1, unit: 'lb', week: { 1: ['r1'] }, routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025', weight: 135 }] }], customEx: [] }

beforeEach(() => { for (const k of Object.keys(mocks)) mocks[k].mockReset() })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('ModelPickerSheet', () => {
  it('lists the models and hands the chosen one to the caller, then closes', async () => {
    mocks.listModels.mockResolvedValue([{ id: 'm1', name: 'Strength base', updated: Date.UTC(2026, 9, 5, 12), routines: 1, exercises: 3 }])
    mocks.getModel.mockResolvedValue({ model: { id: 'm1', name: 'Strength base', _rev: 2, bundle } })
    const onPick = vi.fn(), close = vi.fn()
    const host = mount(<ModelPickerSheet onPick={onPick} close={close} />)
    await settle()
    expect(host.querySelector('li .tt').textContent).toBe('Strength base')
    expect(host.querySelector('li').textContent).toContain('1 routine · 3 exercises')
    await act(async () => host.querySelector('li [role="button"]').click()); await settle()
    expect(mocks.getModel).toHaveBeenCalledWith('m1')
    expect(close).toHaveBeenCalled()
    expect(onPick).toHaveBeenCalledWith(bundle, 'Strength base')
  })

  it('says when there are no models', async () => {
    mocks.listModels.mockResolvedValue([])
    const host = mount(<ModelPickerSheet onPick={vi.fn()} close={vi.fn()} />)
    await settle()
    expect(host.textContent).toContain('No models yet.')
  })

  it('a list that does not load says so, and Try again reads it again', async () => {
    mocks.listModels.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 })).mockResolvedValue([])
    const host = mount(<ModelPickerSheet onPick={vi.fn()} close={vi.fn()} />)
    await settle()
    expect(host.querySelector('[role="alert"]').textContent).toContain('Could not load the models')
    await act(async () => button(host, 'Try again').click()); await settle()
    expect(mocks.listModels).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('No models yet.')
  })

  it('a model that does not load leaves the month alone', async () => {
    mocks.listModels.mockResolvedValue([{ id: 'm1', name: 'A', updated: 1, routines: 0, exercises: 0 }])
    mocks.getModel.mockRejectedValue(Object.assign(new Error('offline'), { status: 0 }))
    const onPick = vi.fn(), close = vi.fn()
    const host = mount(<ModelPickerSheet onPick={onPick} close={close} />)
    await settle()
    await act(async () => host.querySelector('li [role="button"]').click()); await settle()
    expect(onPick).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')).toBeTruthy()
  })
})

describe('SaveModelSheet', () => {
  it('needs a name, then makes the model from the month and says so', async () => {
    mocks.createModel.mockResolvedValue({ model: { id: 'm9', name: 'Base', _rev: 1, bundle } })
    const close = vi.fn(), onSaved = vi.fn()
    const host = mount(<SaveModelSheet bundle={bundle} defaultName="Month 1" close={close} onSaved={onSaved} />)
    const name = host.querySelector('input[aria-label="Model name"]')
    expect(name.value).toBe('Month 1')
    expect(name.maxLength).toBe(40)
    type(name, '   ')
    await submit(host)
    expect(host.querySelector('[role="alert"]').textContent).toBe('Enter a name')
    expect(mocks.createModel).not.toHaveBeenCalled()
    type(name, ' Base ')
    await submit(host)
    expect(mocks.createModel).toHaveBeenCalledWith({ name: 'Base', bundle })
    expect(close).toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('Saved as a model')
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'm9' }))
  })

  it('shows what went wrong in the sheet and stays open', async () => {
    mocks.createModel.mockRejectedValue(Object.assign(new Error('x'), { status: 400, data: { error: 'a trainer keeps up to 100 models', code: 'too-many-models' } }))
    const close = vi.fn()
    const host = mount(<SaveModelSheet bundle={bundle} defaultName="Base" close={close} />)
    await submit(host)
    expect(host.querySelector('[role="alert"]').textContent).toBe('a trainer keeps up to 100 models')
    expect(close).not.toHaveBeenCalled()
  })
})
