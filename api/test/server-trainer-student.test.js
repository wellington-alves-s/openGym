/* The student's side of trainer mode: who my trainer is, what I share, leaving; and what deleting or
   disabling an account does to the other end of the link (a deleted student, a deleted or disabled
   trainer), plus the trainer's unlink when the account is gone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../password.js';
import { startServer } from './trainer-harness.mjs';

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const CONSENT = { measures: true, photos: false, diet: false, at: '2026-01-01T00:00:00.000Z' };
const USERS = [
  user('plain001', 'Plain'),
  user('admin001', 'Admin', { admin: true }),
  user('coachAAA', 'Coach Ana', { role: 'trainer', trainerStatus: 'approved' }),
  user('coachBBB', 'Coach Bia', { role: 'trainer', trainerStatus: 'approved' }),
  user('stud0001', 'Student One', { role: 'student', trainerId: 'coachAAA', consent: CONSENT }),
  user('stud0002', 'Student Two', { role: 'student', trainerId: 'coachAAA' })
];
const ON = { env: { TRAINER_MODE: '1' }, users: USERS };
const NOT_FOUND = { error: 'not found' };
const folder = (s, trainer = 'coachAAA') => path.join(s.dir, 'trainers', trainer, 'students');
const recPath = (s, id, trainer) => path.join(folder(s, trainer), id + '.json');
const readRec = (s, id, trainer) => JSON.parse(fs.readFileSync(recPath(s, id, trainer), 'utf8'));
const audit = s => fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8');
const unlinks = s => (audit(s).match(/"ev":"student\.unlink"/g) || []).length;

// The records the join flow leaves for an active student.
function seed(s, ids = ['stud0001', 'stud0002'], trainer = 'coachAAA', extra = {}) {
  fs.mkdirSync(folder(s, trainer), { recursive: true });
  for (const id of ids) {
    fs.writeFileSync(recPath(s, id, trainer), JSON.stringify({ id, name: id, status: 'active', created: 1, linkedAt: 2222, _rev: 1, ...extra }));
  }
}

test('GET /api/student/trainer answers the name, the date and the consent, and nothing else', async t => {
  const s = await startServer(t, ON);
  seed(s);
  const r = await s.call('/api/student/trainer', { as: 'stud0001' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { trainer: { name: 'Coach Ana' }, since: 2222, consent: CONSENT });
  // A student who never consented: every share is a no.
  assert.deepEqual((await s.call('/api/student/trainer', { as: 'stud0002' })).body.consent,
    { measures: false, photos: false, diet: false, at: null });
});

test('the student routes are for students: a roleless account and a trainer get 404, nobody 401', async t => {
  const s = await startServer(t, ON);
  const routes = [['/api/student/trainer', 'GET', undefined], ['/api/student/consent', 'PUT', { measures: true, photos: true, diet: true }], ['/api/student/unlink', 'POST', undefined]];
  for (const [p, method, body] of routes) {
    for (const as of ['plain001', 'coachAAA']) {
      const r = await s.call(p, { method, body, as });
      assert.deepEqual([r.status, r.body], [404, NOT_FOUND], `${method} ${p} as ${as}`);
    }
    assert.equal((await s.call(p, { method, body })).status, 401, `${method} ${p}`);
  }
  assert.equal(s.db().users.find(u => u.id === 'coachAAA').consent, undefined);
});

test('PUT consent takes three real booleans, stamps the time, and changes nothing else', async t => {
  const s = await startServer(t, ON);
  const before = Date.now();
  const r = await s.call('/api/student/consent', { method: 'PUT', as: 'stud0002', body: { measures: true, photos: false, diet: true, workouts: false, role: 'trainer', trainerId: 'coachBBB' } });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ['consent']);
  assert.deepEqual({ ...r.body.consent, at: undefined }, { measures: true, photos: false, diet: true, at: undefined });
  assert.ok(Date.parse(r.body.consent.at) >= before - 1000);
  const u = s.db().users.find(x => x.id === 'stud0002');
  assert.deepEqual(u.consent, r.body.consent);
  assert.deepEqual([u.role, u.trainerId], ['student', 'coachAAA']);
  assert.equal(Object.keys(u.consent).sort().join(), 'at,diet,measures,photos');
});

test('PUT consent refuses anything that is not a boolean', async t => {
  const s = await startServer(t, ON);
  const bad = [{ measures: 'true', photos: false, diet: false }, { measures: 1, photos: 0, diet: false }, { measures: true, photos: false },
    { measures: null, photos: false, diet: false }, {}, { measures: [], photos: {}, diet: 'yes' }];
  for (const body of bad) {
    const r = await s.call('/api/student/consent', { method: 'PUT', as: 'stud0001', body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(s.db().users.find(u => u.id === 'stud0001').consent, CONSENT);
});

test('a student leaves: no trainer on me, the trainer is locked out, the data stays', async t => {
  const s = await startServer(t, ON);
  seed(s);
  fs.writeFileSync(path.join(s.dir, 'state-stud0001.json'), JSON.stringify({ unit: 'kg', workouts: [{ id: 'w1' }], _rev: 1 }));
  const r = await s.call('/api/student/unlink', { method: 'POST', as: 'stud0001' });
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  assert.equal('trainer' in (await s.call('/api/me', { as: 'stud0001' })).body.user, false);
  assert.equal('trainerId' in s.db().users.find(u => u.id === 'stud0001'), false);
  assert.deepEqual((await s.call('/api/student/trainer', { as: 'stud0001' })).body.trainer, null);
  const rec = readRec(s, 'stud0001');
  assert.equal(rec.status, 'unlinked');
  assert.equal(typeof rec.unlinkedAt, 'number');
  // The trainer's own routes: the same 404 as for a stranger.
  for (const [p, method] of [['/api/trainer/students/stud0001/invite', 'POST']]) {
    assert.equal((await s.call(p, { method, as: 'coachAAA' })).status, 400);   // unlinked, not invited
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.dir, 'state-stud0001.json'), 'utf8')).workouts.length, 1);
  assert.equal(unlinks(s), 1);
  // Again: ok, and nothing is stamped or logged twice.
  const again = await s.call('/api/student/unlink', { method: 'POST', as: 'stud0001' });
  assert.deepEqual([again.status, again.body], [200, { ok: true }]);
  assert.equal(readRec(s, 'stud0001').unlinkedAt, rec.unlinkedAt);
  assert.equal(unlinks(s), 1);
  // The other student is untouched.
  assert.equal(readRec(s, 'stud0002').status, 'active');
  assert.equal(s.db().users.find(u => u.id === 'stud0002').trainerId, 'coachAAA');
});

test('deleting a trainer unlinks both students and drops their invites', async t => {
  const s = await startServer(t, { ...ON, seed: { studentInvites: [] } });
  seed(s);
  const rita = (await s.call('/api/trainer/students', { method: 'POST', body: { name: 'Rita' }, as: 'coachAAA' })).body.student;
  await s.call('/api/trainer/students', { method: 'POST', body: { name: 'Other' }, as: 'coachBBB' });
  assert.equal(s.db().studentInvites.length, 2);
  const r = await s.call('/api/admin/user/delete', { method: 'POST', body: { id: 'coachAAA' }, as: 'admin001' });
  assert.equal(r.status, 200);
  const db = s.db();
  for (const id of ['stud0001', 'stud0002']) {
    assert.equal('trainerId' in db.users.find(u => u.id === id), false, id);
    assert.equal(readRec(s, id).status, 'unlinked', id);
  }
  assert.equal(readRec(s, rita.id).status, 'unlinked');
  assert.deepEqual(db.studentInvites.map(i => i.trainerId), ['coachBBB']);
  assert.equal(db.users.find(u => u.id === 'stud0001').role, 'student');
});

test('a trainer deleting their own account detaches the students too', async t => {
  const GOOD = 'correct horse battery staple';
  const pw = { h: await hashPassword(GOOD), set: new Date().toISOString() };
  const users = USERS.map(u => (u.id === 'coachAAA' ? { ...u, pw } : u));
  const s = await startServer(t, { env: { TRAINER_MODE: '1', PASSWORD_LOGIN: '1' }, users });
  seed(s);
  const r = await s.call('/api/account/delete', { method: 'POST', body: { name: 'Coach Ana', current: GOOD }, as: 'coachAAA' });
  assert.equal(r.status, 200);
  for (const id of ['stud0001', 'stud0002']) {
    assert.equal('trainerId' in s.db().users.find(u => u.id === id), false);
    assert.equal(readRec(s, id).status, 'unlinked');
  }
});

test('disabling a trainer detaches the students: they see no trainer', async t => {
  const s = await startServer(t, ON);
  seed(s);
  assert.equal((await s.call('/api/student/trainer', { as: 'stud0001' })).body.trainer.name, 'Coach Ana');
  const r = await s.call('/api/admin/user/disable', { method: 'POST', body: { id: 'coachAAA', disabled: true }, as: 'admin001' });
  assert.equal(r.status, 200);
  assert.deepEqual((await s.call('/api/student/trainer', { as: 'stud0001' })).body.trainer, null);
  assert.equal('trainer' in (await s.call('/api/me', { as: 'stud0001' })).body.user, false);
  assert.equal(readRec(s, 'stud0001').status, 'unlinked');
  assert.equal(readRec(s, 'stud0002').status, 'unlinked');
});

test('deleting a student, by the admin or by themselves, marks the trainer record unlinked', async t => {
  const GOOD = 'correct horse battery staple';
  const pw = { h: await hashPassword(GOOD), set: new Date().toISOString() };
  const users = USERS.map(u => (u.id === 'stud0002' ? { ...u, pw } : u));
  const s = await startServer(t, { env: { TRAINER_MODE: '1', PASSWORD_LOGIN: '1' }, users });
  seed(s);
  assert.equal((await s.call('/api/admin/user/delete', { method: 'POST', body: { id: 'stud0001' }, as: 'admin001' })).status, 200);
  assert.equal(readRec(s, 'stud0001').status, 'unlinked');
  const own = await s.call('/api/account/delete', { method: 'POST', body: { name: 'Student Two', current: GOOD }, as: 'stud0002' });
  assert.equal(own.status, 200);
  assert.equal(readRec(s, 'stud0002').status, 'unlinked');
  // The trainer is still there, and still sees both as records.
  assert.ok(s.db().users.some(u => u.id === 'coachAAA'));
  assert.equal((await s.call('/api/trainer/students', { as: 'coachAAA' })).body.students.length, 2);
});

test('the effects run on a role even with TRAINER_MODE off, and leave a roleless account alone', async t => {
  const s = await startServer(t, { users: USERS });   // flag off
  seed(s);
  assert.equal((await s.call('/api/admin/user/delete', { method: 'POST', body: { id: 'plain001' }, as: 'admin001' })).status, 200);
  assert.equal(fs.readdirSync(folder(s)).length, 2);
  assert.equal(readRec(s, 'stud0001').status, 'active');
  assert.equal((await s.call('/api/admin/user/delete', { method: 'POST', body: { id: 'coachAAA' }, as: 'admin001' })).status, 200);
  assert.equal(readRec(s, 'stud0001').status, 'unlinked');
  assert.equal('trainerId' in s.db().users.find(u => u.id === 'stud0001'), false);
  assert.equal(unlinks(s), 0);   // the effect is bookkeeping, not a trainer action
});

test('a trainer can unlink a record whose account was deleted behind their back', async t => {
  const s = await startServer(t, ON);
  seed(s);
  // The account is removed; the record is put back as it was, still active.
  await s.call('/api/admin/user/delete', { method: 'POST', body: { id: 'stud0001' }, as: 'admin001' });
  fs.writeFileSync(recPath(s, 'stud0001'), JSON.stringify({ id: 'stud0001', name: 'x', status: 'active', created: 1, linkedAt: 2, _rev: 5 }));
  assert.ok(!s.db().users.some(u => u.id === 'stud0001'));
  // Every other route still answers 404 for it.
  assert.equal((await s.call('/api/trainer/students/stud0001', { method: 'DELETE', as: 'coachAAA' })).status, 404);
  assert.equal((await s.call('/api/trainer/students/stud0001/invite', { method: 'POST', as: 'coachAAA' })).status, 404);
  const r = await s.call('/api/trainer/students/stud0001/unlink', { method: 'POST', as: 'coachAAA' });
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  assert.equal(readRec(s, 'stud0001').status, 'unlinked');
  assert.equal(unlinks(s), 1);
  // And again: ok, no second stamp, no second event.
  const stamp = readRec(s, 'stud0001').unlinkedAt;
  assert.equal((await s.call('/api/trainer/students/stud0001/unlink', { method: 'POST', as: 'coachAAA' })).status, 200);
  assert.equal(readRec(s, 'stud0001').unlinkedAt, stamp);
  assert.equal(unlinks(s), 1);
});

test('unlinking an old record never touches an account that now belongs to another trainer', async t => {
  const users = USERS.map(u => (u.id === 'stud0001' ? { ...u, trainerId: 'coachBBB' } : u));
  const s = await startServer(t, { env: ON.env, users });
  seed(s, ['stud0001']);   // Ana's stale record
  const r = await s.call('/api/trainer/students/stud0001/unlink', { method: 'POST', as: 'coachAAA' });
  assert.equal(r.status, 200);
  assert.equal(readRec(s, 'stud0001').status, 'unlinked');
  assert.equal(s.db().users.find(u => u.id === 'stud0001').trainerId, 'coachBBB');
  assert.equal((await s.call('/api/student/trainer', { as: 'stud0001' })).body.trainer.name, 'Coach Bia');
});

test('a record that never went live can be deleted, also after it was unlinked; a live one cannot', async t => {
  const s = await startServer(t, ON);
  seed(s, ['stud0001']);
  const { id } = (await s.call('/api/trainer/students', { method: 'POST', body: { name: 'Rita' }, as: 'coachAAA' })).body.student;
  assert.equal((await s.call(`/api/trainer/students/${id}/unlink`, { method: 'POST', as: 'coachAAA' })).status, 200);
  assert.equal(readRec(s, id).status, 'unlinked');
  const del = await s.call(`/api/trainer/students/${id}`, { method: 'DELETE', as: 'coachAAA' });
  assert.deepEqual([del.status, del.body], [200, { ok: true }]);
  assert.equal(fs.existsSync(recPath(s, id)), false);
  // Once linked, the record is history: unlink it, but it stays.
  await s.call('/api/trainer/students/stud0001/unlink', { method: 'POST', as: 'coachAAA' });
  const kept = await s.call('/api/trainer/students/stud0001', { method: 'DELETE', as: 'coachAAA' });
  assert.deepEqual([kept.status, kept.body.code], [400, 'use-unlink']);
  assert.ok(fs.existsSync(recPath(s, 'stud0001')));
});
