/* The student's side of the prescription: read the published plan and its version, nothing else. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './trainer-harness.mjs';

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const USERS = [
  user('trainer01', 'Coach One', { role: 'trainer', trainerStatus: 'approved' }),
  user('trainer02', 'Coach Two', { role: 'trainer', trainerStatus: 'pending' }),
  user('student01', 'Student A', { role: 'student', trainerId: 'trainer01' }),
  user('student02', 'Student B', { role: 'student', trainerId: 'trainer01' }),
  user('student03', 'Student C', { role: 'student', trainerId: 'trainer01' }),
  user('student07', 'Phases', { role: 'student', trainerId: 'trainer01' }),
  user('student08', 'One phase', { role: 'student', trainerId: 'trainer01' }),
  user('student04', 'Loose', { role: 'student' }),
  user('student05', 'Behind', { role: 'student', trainerId: 'trainer02' }),
  user('plain001', 'Plain')
];
const rec = id => JSON.stringify({ id, name: id, status: 'active', created: 1, linkedAt: 2, _rev: 1 });
const bundle = id => ({ opengym_plan: 1, unit: 'kg', week: { 1: 'r1' }, routines: [{ id: 'r1', name: 'A', ex: [{ id }] }], customEx: [] });
const prog = (...bundles) => ({ start: null, phases: bundles.map((b, i) => ({ id: 'p' + (i + 1), name: '', weeks: i + 1, bundle: b })) });
const rxDoc = (id, current) => JSON.stringify({
  _rev: 4, draft: { bundle: bundle('DRAFT-' + id), updated: 9 }, current,
  versions: [{ v: 1, at: 10, note: 'one', bundle: bundle('v1-' + id) }, { v: 2, at: 20, note: 'two', bundle: bundle('v2-' + id) }]
});
const files = {
  'trainers/trainer01/students/student01.json': rec('student01'),
  'trainers/trainer01/students/student02.json': rec('student02'),
  'trainers/trainer01/students/student03.json': rec('student03'),
  'trainers/trainer01/students/student07.json': rec('student07'),
  'trainers/trainer01/students/student08.json': rec('student08'),
  'trainers/trainer01/rx/student08.json': JSON.stringify({
    _rev: 1, draft: { program: prog(bundle('DRAFT-D')), updated: 9 }, current: 1,
    versions: [{ v: 1, at: 10, note: 'solo', program: { ...prog(bundle('d1')), start: '2026-11-09' } }]
  }),
  'trainers/trainer01/rx/student01.json': rxDoc('A', 2),
  'trainers/trainer01/rx/student02.json': rxDoc('B', 1),
  'trainers/trainer01/rx/student07.json': JSON.stringify({
    _rev: 2, draft: { program: prog(bundle('DRAFT-C1'), bundle('DRAFT-C2')), updated: 9 }, current: 2,
    versions: [{ v: 1, at: 10, note: 'solo', program: prog(bundle('c1')) }, { v: 2, at: 20, note: 'two phases', program: prog(bundle('c2a'), bundle('c2b')) }]
  }),
  'trainers/trainer02/rx/student05.json': rxDoc('E', 1)
};
const ON = { env: { TRAINER_MODE: '1' }, users: USERS, files };
const NOT_FOUND = { error: 'not found' };
const PATHS = ['/api/student/rx/rev', '/api/student/rx'];

test('a student with nothing published gets v null on both routes', async t => {
  const s = await startServer(t, ON);   // student03 has no rx file at all
  for (const p of PATHS) assert.deepEqual((await s.call(p, { as: 'student03' })).body, { v: null }, p);
});

test('rev is the current version; the plan is that version, never the draft', async t => {
  const s = await startServer(t, ON);
  assert.deepEqual((await s.call(PATHS[0], { as: 'student01' })).body, { v: 2 });
  const r = await s.call(PATHS[1], { as: 'student01' });
  assert.equal(r.status, 200);
  // a stage 2a file on disk: one phase, so the program and the bare bundle both come
  assert.deepEqual(r.body, { v: 2, at: 20, note: 'two', program: { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: bundle('v2-A') }] }, bundle: bundle('v2-A') });
  assert.doesNotMatch(JSON.stringify(r.body), /DRAFT|v1-/);
});

test('each student reads only their own plan', async t => {
  const s = await startServer(t, ON);
  assert.equal((await s.call(PATHS[1], { as: 'student01' })).body.program.phases[0].bundle.routines[0].ex[0].id, 'v2-A');
  const b = await s.call(PATHS[1], { as: 'student02' });
  assert.deepEqual([b.body.v, b.body.program.phases[0].bundle.routines[0].ex[0].id], [1, 'v1-B']);
});

test('no trainer, an unapproved trainer or a disabled one is a 404', async t => {
  const s = await startServer(t, { ...ON, users: [...USERS, user('student06', 'Off', { role: 'student', trainerId: 'trainer03' }), user('trainer03', 'Off', { role: 'trainer', trainerStatus: 'approved', disabled: true })] });
  for (const p of PATHS) for (const as of ['student04', 'student05', 'student06']) {
    const r = await s.call(p, { as });
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], `${p} as ${as}`);
  }
});

test('a roleless account and a trainer get 404, nobody gets 401', async t => {
  const s = await startServer(t, ON);
  for (const p of PATHS) {
    for (const as of ['plain001', 'trainer01']) {
      const r = await s.call(p, { as });
      assert.deepEqual([r.status, r.body], [404, NOT_FOUND], `${p} as ${as}`);
    }
    assert.equal((await s.call(p)).status, 401, p);
  }
});

test('after the student leaves, both routes are 404', async t => {
  const s = await startServer(t, ON);
  assert.equal((await s.call(PATHS[0], { as: 'student01' })).status, 200);
  assert.equal((await s.call('/api/student/unlink', { method: 'POST', as: 'student01' })).status, 200);
  for (const p of PATHS) assert.equal((await s.call(p, { as: 'student01' })).status, 404, p);
  assert.equal(fs.existsSync(path.join(s.dir, 'trainers/trainer01/rx/student01.json')), true);   // the trainer keeps the plan
});

test('with TRAINER_MODE off the routes do not exist', async t => {
  const s = await startServer(t, { ...ON, env: { TRAINER_MODE: '' } });
  for (const p of PATHS) assert.equal((await s.call(p, { as: 'student01' })).status, 404, p);
});

test('a one-phase program in the new format comes as the program and its bundle', async t => {
  const s = await startServer(t, ON);
  const r = await s.call(PATHS[1], { as: 'student08' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { v: 1, at: 10, note: 'solo', program: { ...prog(bundle('d1')), start: '2026-11-09' }, bundle: bundle('d1') });
});

test('with several phases the student gets the program and no bundle key', async t => {
  const s = await startServer(t, ON);
  const r = await s.call(PATHS[1], { as: 'student07' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.v, r.body.note, r.body.program.phases.length], [2, 'two phases', 2]);
  assert.equal('bundle' in r.body, false);
  assert.doesNotMatch(JSON.stringify(r.body), /DRAFT/);
});
