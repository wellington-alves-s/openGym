/* TRAINER_MODE: the flag in /api/config and the role fields on /api/me. With the flag off, or an
   account without a role, the answers are exactly the ones from before the mode existed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './trainer-harness.mjs';

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const USERS = [
  user('plain001', 'Plain'),
  user('coach001', 'Coach Carla', { role: 'trainer', trainerStatus: 'approved' }),
  user('wait0001', 'Waiting', { role: 'trainer', trainerStatus: 'pending' }),
  user('stud0001', 'Student', { role: 'student', trainerId: 'coach001' }),
  user('stud0002', 'Orphan', { role: 'student', trainerId: 'gone0000' })
];

test('without TRAINER_MODE, config and me look as they always did', async t => {
  const s = await startServer(t, { users: USERS });
  assert.equal('trainer_mode' in (await s.call('/api/config')).body, false);
  assert.deepEqual((await s.call('/api/me', { as: 'plain001' })).body, { user: { id: 'plain001', name: 'Plain', admin: false } });
  // Even a stored role stays out of the answer while the mode is off.
  assert.deepEqual((await s.call('/api/me', { as: 'coach001' })).body, { user: { id: 'coach001', name: 'Coach Carla', admin: false } });
});

test('with TRAINER_MODE, config says so and a roleless account is still unchanged', async t => {
  const s = await startServer(t, { env: { TRAINER_MODE: '1' }, users: USERS });
  assert.equal((await s.call('/api/config')).body.trainer_mode, true);
  assert.deepEqual((await s.call('/api/me', { as: 'plain001' })).body, { user: { id: 'plain001', name: 'Plain', admin: false } });
});

test('with TRAINER_MODE, me carries the role of a trainer and of a student', async t => {
  const s = await startServer(t, { env: { TRAINER_MODE: '1' }, users: USERS });
  assert.deepEqual((await s.call('/api/me', { as: 'coach001' })).body.user,
    { id: 'coach001', name: 'Coach Carla', admin: false, role: 'trainer', trainerStatus: 'approved' });
  assert.equal((await s.call('/api/me', { as: 'wait0001' })).body.user.trainerStatus, 'pending');
  assert.deepEqual((await s.call('/api/me', { as: 'stud0001' })).body.user,
    { id: 'stud0001', name: 'Student', admin: false, role: 'student', trainer: { name: 'Coach Carla' } });
  // A student whose trainer is gone has a role and no trainer.
  assert.deepEqual((await s.call('/api/me', { as: 'stud0002' })).body.user,
    { id: 'stud0002', name: 'Orphan', admin: false, role: 'student' });
});

test('the harness reads the db from disk and stops the child', async t => {
  const s = await startServer(t, { users: USERS });
  assert.equal(s.db().users.length, USERS.length);
  assert.equal((await s.call('/api/me')).status, 401);
});
