// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Models from './Models.jsx'
import { DEF, useStore } from '../../store/useStore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The trainer's models: the list, a new one opened in the editor, renamed, deleted once confirmed. */
const mocks = vi.hoisted(() => ({ listModels: vi.fn(), getModel: vi.fn(), createModel: vi.fn(), saveModel: vi.fn(), deleteModel: vi.fn(), confirmSheet: vi.fn() }))
vi.mock('../../lib/trainer-api.js', () => ({
  listModels: (...a) => mocks.listModels(...a), getModel: (...a) => mocks.getModel(...a), createModel: (...a) => mocks.createModel(...a),
  saveModel: (...a) => mocks.saveModel(...a), deleteModel: (...a) => mocks.deleteModel(...a),
}))
vi.mock('../../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirmSheet(...a) }))

const two = [
  { id: 'm1', name: 'Strength base', updated: Date.UTC(2026, 9, 5, 12), routines: 2, exercises: 7 },
  { id: 'm2', name: 'Deload', updated: Date.UTC(2026, 9, 6, 12), routines: 1, exercises: 1 },
]
const conflict = () => Object.assign(new Error('the model changed elsewhere'), { status: 409, data: { code: 'conflict' } })

function Editor() { return <p>editor {useParams().mid}</p> }
let host, root
async function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<MemoryRouter initialEntries={['/models']}><Routes>
    <Route path="/models" element={<Models />} />
    <Route path="/models/:mid/plan" element={<Editor />} />
  </Routes></MemoryRouter>))
  await settle()
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
function type(el, value) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const press = async (el, label) => { await act(async () => [...el.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label).click()); await settle() }
const submit = async () => { await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); await settle() }
const row = name => [...host.querySelectorAll('li')].find(li => li.querySelector('.tt')?.textContent === name)
const nameField = () => host.querySelector('input[aria-label="Model name"]')

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  useStore.setState({ S: { ...structuredClone(DEF), unit: 'lb' } })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('Models', () => {
  it('lists the models with their routines, exercises and date, in a labelled list', async () => {
    mocks.listModels.mockResolvedValue(two)
    await mount()
    expect(host.querySelector('ul').getAttribute('aria-label')).toBe('Models')
    expect([...host.querySelectorAll('li .tt')].map(e => e.textContent)).toEqual(['Strength base', 'Deload'])
    expect(row('Strength base').textContent).toContain('2 routines · 7 exercises')
    expect(row('Deload').textContent).toContain('1 routine · 1 exercise')
  })

  it('a tap on a model opens it in the editor', async () => {
    mocks.listModels.mockResolvedValue(two)
    await mount()
    await act(async () => row('Deload').querySelector('[role="button"]').click())
    expect(host.textContent).toContain('editor m2')
  })

  it('makes a new empty model in the trainer\'s unit, once it has a name, and opens it', async () => {
    mocks.listModels.mockResolvedValue([])
    mocks.createModel.mockResolvedValue({ model: { id: 'm9', name: 'Hypertrophy', _rev: 1, updated: 1 } })
    await mount()
    await press(host, 'New model')
    expect(nameField().maxLength).toBe(40)
    type(nameField(), '   ')
    await submit()
    expect(host.querySelector('[role="alert"]').textContent).toBe('Enter a name')
    expect(mocks.createModel).not.toHaveBeenCalled()
    type(nameField(), ' Hypertrophy ')
    await submit()
    expect(mocks.createModel).toHaveBeenCalledWith({ name: 'Hypertrophy', bundle: { opengym_plan: 1, unit: 'lb', week: {}, routines: [], customEx: [] } })
    expect(host.textContent).toContain('editor m9')
  })

  it('renames with the rev it reads first, reads it once more after a 409, and refreshes the list', async () => {
    mocks.listModels.mockResolvedValueOnce(two).mockResolvedValue([{ ...two[0], name: 'Power' }, two[1]])
    mocks.getModel.mockResolvedValueOnce({ model: { id: 'm1', _rev: 3 } }).mockResolvedValueOnce({ model: { id: 'm1', _rev: 4 } })
    mocks.saveModel.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ model: { id: 'm1', _rev: 5 } })
    await mount()
    await press(row('Strength base'), 'Rename Strength base')
    expect(nameField().value).toBe('Strength base')
    type(nameField(), 'Power')
    await submit()
    expect(mocks.getModel).toHaveBeenCalledTimes(2)
    expect(mocks.saveModel.mock.calls).toEqual([['m1', { name: 'Power', _rev: 3 }], ['m1', { name: 'Power', _rev: 4 }]])
    expect(mocks.listModels).toHaveBeenCalledTimes(2)
    expect([...host.querySelectorAll('li .tt')].map(e => e.textContent)).toEqual(['Power', 'Deload'])
    expect(nameField()).toBeNull()
  })

  it('a rename that meets a second 409 says so and keeps the field', async () => {
    mocks.listModels.mockResolvedValue(two)
    mocks.getModel.mockResolvedValue({ model: { id: 'm1', _rev: 3 } })
    mocks.saveModel.mockRejectedValue(conflict())
    await mount()
    await press(row('Strength base'), 'Rename Strength base')
    type(nameField(), 'Power')
    await submit()
    expect(mocks.saveModel).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="alert"]').textContent).toBe('The model changed somewhere else')
    expect(nameField().value).toBe('Power')
  })

  it('deletes a model only once confirmed, then refreshes the list', async () => {
    mocks.listModels.mockResolvedValueOnce(two).mockResolvedValue([two[1]])
    mocks.deleteModel.mockResolvedValue({ ok: true })
    await mount()
    await press(row('Strength base'), 'Delete Strength base')
    expect(mocks.confirmSheet).toHaveBeenCalledTimes(1)
    expect(mocks.confirmSheet.mock.calls[0][0]).toMatchObject({ title: 'Delete Strength base?', confirmText: 'Delete model', danger: true })
    expect(mocks.deleteModel).not.toHaveBeenCalled()
    await act(async () => mocks.confirmSheet.mock.calls[0][0].onConfirm()); await settle()
    expect(mocks.deleteModel).toHaveBeenCalledWith('m1')
    expect([...host.querySelectorAll('li .tt')].map(e => e.textContent)).toEqual(['Deload'])
  })

  it('with no models says how to make one', async () => {
    mocks.listModels.mockResolvedValue([])
    await mount()
    expect(host.textContent).toContain('No models yet. Make one here, or save a month of a program as a model.')
  })

  it('a list that does not load says so, and Try again reads it again', async () => {
    mocks.listModels.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 })).mockResolvedValue(two)
    await mount()
    expect(host.querySelector('[role="alert"]').textContent).toContain('Could not load the models')
    await press(host, 'Try again')
    expect(mocks.listModels).toHaveBeenCalledTimes(2)
    expect(host.querySelectorAll('li')).toHaveLength(2)
  })
})
