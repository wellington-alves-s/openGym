// The trainer-mode routes (api/trainer-routes.js), through api.js like every other call.
import { api, createPasskey } from './api.js'

const send = (method, path, body) => api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
// An id or code from outside is one path segment, whatever it holds.
const seg = s => encodeURIComponent(s)

// A trainer's students.
export const listStudents = async () => (await api('/api/trainer/students')).students || []
export const createStudent = ({ name, phone, email }) => send('POST', '/api/trainer/students', { name, phone, email })   // → { student, code }
export const newInvite = async id => (await send('POST', `/api/trainer/students/${seg(id)}/invite`)).code
export const removeStudent = id => send('DELETE', `/api/trainer/students/${seg(id)}`)
export const unlinkStudent = id => send('POST', `/api/trainer/students/${seg(id)}/unlink`)

// Joining with an invite code (public).
export const joinInfo = code => api(`/api/join/${seg(code)}`)   // → { trainerName, studentName, shares }
export const joinWithPassword = async (code, { name, password, consent }) =>
  (await send('POST', `/api/join/${seg(code)}/password`, { name, password, consent })).user
export async function joinWithPasskey(code, { name, consent }) {
  const { cid, options } = await send('POST', `/api/join/${seg(code)}/options`, { name })
  const credential = await createPasskey(options)
  return (await send('POST', `/api/join/${seg(code)}/verify`, { cid, credential, consent })).user
}

// A student's side.
export const myTrainer = () => api('/api/student/trainer')   // → { trainer, since, consent }
export const setConsent = consent => send('PUT', '/api/student/consent', consent)
export const leaveTrainer = () => send('POST', '/api/student/unlink')
export const studentRxRev = () => api('/api/student/rx/rev')   // → { v: number | null }
export const studentRx = () => api('/api/student/rx')   // → { v, at, note, bundle }

// The owner's side.
export const listTrainers = async () => (await api('/api/admin/trainers')).trainers || []
export const approveTrainer = id => send('POST', '/api/admin/trainer/approve', { id })
export const rejectTrainer = id => send('POST', '/api/admin/trainer/reject', { id })
export const setTrainerMode = (id, on) => send('POST', '/api/admin/user/trainer', { id, on })
