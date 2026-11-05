import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.js', () => ({ api: vi.fn(async () => ({})), createPasskey: vi.fn() }))

const { api, createPasskey } = await import('./api.js')
const t = await import('./trainer-api.js')

beforeEach(() => api.mockClear())

const lastCall = () => api.mock.calls.at(-1)
const sent = () => JSON.parse(lastCall()[1].body)

describe('trainer side', () => {
  it('lists the students and hands back the array', async () => {
    api.mockResolvedValueOnce({ students: [{ id: 's1' }] })
    expect(await t.listStudents()).toEqual([{ id: 's1' }])
    expect(lastCall()[0]).toBe('/api/trainer/students')
    expect(lastCall()[1]?.method || 'GET').toBe('GET')
  })

  it('creates a student with name, phone and email, and hands back the answer', async () => {
    api.mockResolvedValueOnce({ student: { id: 's1' }, code: 'AAAA-BBBB-CCCC' })
    const r = await t.createStudent({ name: 'Bo', phone: '555', email: 'bo@example.com' })
    expect(r).toEqual({ student: { id: 's1' }, code: 'AAAA-BBBB-CCCC' })
    expect(lastCall()[0]).toBe('/api/trainer/students')
    expect(lastCall()[1].method).toBe('POST')
    expect(sent()).toEqual({ name: 'Bo', phone: '555', email: 'bo@example.com' })
  })

  it('makes a new invite for one student', async () => {
    api.mockResolvedValueOnce({ code: 'AAAA-BBBB-CCCC' })
    expect(await t.newInvite('s1')).toBe('AAAA-BBBB-CCCC')
    expect(lastCall()[0]).toBe('/api/trainer/students/s1/invite')
    expect(lastCall()[1].method).toBe('POST')
  })

  it('removes and unlinks a student', async () => {
    await t.removeStudent('s1')
    expect(lastCall()[0]).toBe('/api/trainer/students/s1')
    expect(lastCall()[1].method).toBe('DELETE')
    await t.unlinkStudent('s1')
    expect(lastCall()[0]).toBe('/api/trainer/students/s1/unlink')
    expect(lastCall()[1].method).toBe('POST')
  })

  it('encodes an id so it stays one path segment', async () => {
    await t.newInvite('a/b?c')
    expect(lastCall()[0]).toBe('/api/trainer/students/a%2Fb%3Fc/invite')
  })
})

describe('joining as a student', () => {
  it('asks what an invite is for', async () => {
    api.mockResolvedValueOnce({ trainerName: 'Di', studentName: 'Bo', shares: ['workouts'] })
    expect((await t.joinInfo('AB-12')).trainerName).toBe('Di')
    expect(lastCall()[0]).toBe('/api/join/AB-12')
    expect(lastCall()[1]?.method || 'GET').toBe('GET')
  })

  it('encodes the code in the path', async () => {
    await t.joinInfo('A B/1')
    expect(lastCall()[0]).toBe('/api/join/A%20B%2F1')
  })

  it('joins by password with the name, password and consent, and hands back the user', async () => {
    api.mockResolvedValueOnce({ user: { id: 's1', role: 'student' } })
    const consent = { measures: true, photos: false, diet: false }
    expect(await t.joinWithPassword('AB-12', { name: 'Bo', password: 'correct horse', consent })).toEqual({ id: 's1', role: 'student' })
    expect(lastCall()[0]).toBe('/api/join/AB-12/password')
    expect(lastCall()[1].method).toBe('POST')
    expect(sent()).toEqual({ name: 'Bo', password: 'correct horse', consent })
  })
})

describe('student side', () => {
  it('reads the trainer', async () => {
    api.mockResolvedValueOnce({ trainer: { name: 'Di' }, since: 1, consent: {} })
    expect((await t.myTrainer()).trainer.name).toBe('Di')
    expect(lastCall()[0]).toBe('/api/student/trainer')
  })

  it('sets the consent with the three flags', async () => {
    await t.setConsent({ measures: true, photos: false, diet: true })
    expect(lastCall()[0]).toBe('/api/student/consent')
    expect(lastCall()[1].method).toBe('PUT')
    expect(sent()).toEqual({ measures: true, photos: false, diet: true })
  })

  it('leaves the trainer', async () => {
    await t.leaveTrainer()
    expect(lastCall()[0]).toBe('/api/student/unlink')
    expect(lastCall()[1].method).toBe('POST')
  })
})

describe('owner side', () => {
  it('lists the trainers and hands back the array', async () => {
    api.mockResolvedValueOnce({ trainers: [{ id: 't1' }] })
    expect(await t.listTrainers()).toEqual([{ id: 't1' }])
    expect(lastCall()[0]).toBe('/api/admin/trainers')
  })

  it('approves and rejects by id', async () => {
    await t.approveTrainer('t1')
    expect(lastCall()[0]).toBe('/api/admin/trainer/approve')
    expect(lastCall()[1].method).toBe('POST')
    expect(sent()).toEqual({ id: 't1' })
    await t.rejectTrainer('t1')
    expect(lastCall()[0]).toBe('/api/admin/trainer/reject')
    expect(lastCall()[1].method).toBe('POST')
    expect(sent()).toEqual({ id: 't1' })
  })

  it('switches trainer mode on or off for an account', async () => {
    await t.setTrainerMode('u1', true)
    expect(lastCall()[0]).toBe('/api/admin/user/trainer')
    expect(lastCall()[1].method).toBe('POST')
    expect(sent()).toEqual({ id: 'u1', on: true })
    await t.setTrainerMode('u1', false)
    expect(sent()).toEqual({ id: 'u1', on: false })
  })
})

describe('joining with a passkey', () => {
  it('asks for options with the name, makes the passkey, and sends it with the consent', async () => {
    const consent = { measures: false, photos: true, diet: false }
    api.mockResolvedValueOnce({ cid: 'c1', options: { challenge: 'x' } })
    api.mockResolvedValueOnce({ user: { id: 's1', role: 'student' } })
    createPasskey.mockResolvedValueOnce({ id: 'cred' })
    expect(await t.joinWithPasskey('AB-12', { name: 'Bo', consent })).toEqual({ id: 's1', role: 'student' })
    expect(api.mock.calls.at(-2)[0]).toBe('/api/join/AB-12/options')
    expect(JSON.parse(api.mock.calls.at(-2)[1].body)).toEqual({ name: 'Bo' })
    expect(createPasskey).toHaveBeenCalledWith({ challenge: 'x' })
    expect(lastCall()[0]).toBe('/api/join/AB-12/verify')
    expect(lastCall()[1].method).toBe('POST')
    expect(sent()).toEqual({ cid: 'c1', credential: { id: 'cred' }, consent })
  })

  it('stops when the prompt is closed, sending nothing more', async () => {
    api.mockResolvedValueOnce({ cid: 'c1', options: {} })
    createPasskey.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    await expect(t.joinWithPasskey('AB-12', { name: 'Bo', consent: {} })).rejects.toThrow()
    expect(lastCall()[0]).toBe('/api/join/AB-12/options')
  })
})
