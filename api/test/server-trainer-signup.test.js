/* TRAINER_MODE sign-up: `as: 'trainer'` (+ phone) on the three registration routes makes a pending
   trainer; the first account on an empty server claims it. Without the mode, `as` is ignored. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './trainer-harness.mjs';
import { softPasskey } from './soft-passkey.mjs';

const PW = 'correct horse battery staple';
const ON = { TRAINER_MODE: '1', PASSWORD_LOGIN: '1' };
const reg = (s, body) => s.call('/api/register/password', { method: 'POST', body: { password: PW, ...body } });
const regPasskey = async (s, body) => {
  const opt = await s.call('/api/register/options', { method: 'POST', body });
  assert.equal(opt.status, 200);
  return s.call('/api/register/verify', { method: 'POST', body: { cid: opt.body.cid, credential: softPasskey().attestation(opt.body.options.challenge) } });
};
const audit = s => fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const OLD = [{ id: 'old00001', name: 'Old', created: new Date().toISOString() }];

test('a trainer signs up pending, with a phone, and is no admin', async t => {
  const s = await startServer(t, { env: ON, users: OLD });
  const r = await reg(s, { name: 'Carla', as: 'trainer', phone: '  +55 11 99999-0000  ' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: r.body.user.id, name: 'Carla', admin: false, role: 'trainer', trainerStatus: 'pending' });
  assert.deepEqual((await s.call('/api/me', { as: r.body.user.id })).body.user, r.body.user);
  const row = s.db().users.find(u => u.id === r.body.user.id);
  assert.equal(row.phone, '+55 11 99999-0000');
  assert.equal(row.owner, undefined);
  const ev = audit(s).find(e => e.ev === 'trainer.signup');
  assert.equal(ev.uid, r.body.user.id);
  assert.equal(JSON.stringify(ev).includes('99999'), false);
});

test('the phone is cut at 30 characters and left out when empty', async t => {
  const s = await startServer(t, { env: ON, users: OLD });
  const a = await reg(s, { name: 'Ana', as: 'trainer', phone: '1'.repeat(50) });
  const b = await reg(s, { name: 'Bea', as: 'trainer' });
  const rows = s.db().users;
  assert.equal(rows.find(u => u.id === a.body.user.id).phone, '1'.repeat(30));
  assert.equal('phone' in rows.find(u => u.id === b.body.user.id), false);
});

test('the first account on an empty server becomes approved owner and admin, without FIRST_USER_ADMIN', async t => {
  const s = await startServer(t, { env: ON });
  const r = await reg(s, { name: 'Carla', as: 'trainer' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: r.body.user.id, name: 'Carla', admin: true, owner: true, role: 'trainer', trainerStatus: 'approved' });
  const second = await reg(s, { name: 'Dora', as: 'trainer' });
  assert.equal(second.body.user.trainerStatus, 'pending');
  assert.equal(second.body.user.admin, false);
  assert.equal(audit(s).filter(e => e.ev === 'admin.first-user').length, 1);
});

test('any other role is refused with bad-role and creates nothing', async t => {
  const s = await startServer(t, { env: ON, users: OLD });
  for (const as of ['student', 'admin', '', 5, {}]) {
    const r = await reg(s, { name: 'Eve', as });
    assert.equal(r.status, 400, JSON.stringify(as));
    assert.equal(r.body.code, 'bad-role');
    assert.equal((await s.call('/api/register/options', { method: 'POST', body: { name: 'Eve', as } })).body.code, 'bad-role');
  }
  assert.equal(s.db().users.length, 1);
});

test('without TRAINER_MODE the field is ignored, whatever it holds', async t => {
  const s = await startServer(t, { env: { PASSWORD_LOGIN: '1' }, users: OLD });
  for (const as of ['trainer', 'student', 'nonsense']) {
    const r = await reg(s, { name: 'Fran' + as, as, phone: '123' });
    assert.equal(r.status, 200, as);
    assert.deepEqual(r.body.user, { id: r.body.user.id, name: 'Fran' + as, admin: false });
    const row = s.db().users.find(u => u.id === r.body.user.id);
    assert.equal('role' in row || 'trainerStatus' in row || 'phone' in row, false);
  }
  assert.equal((await regPasskey(s, { name: 'Gil', as: 'trainer' })).body.user.role, undefined);
  assert.equal(audit(s).some(e => e.ev === 'trainer.signup'), false);
});

test('without the field nothing changes, even in trainer mode', async t => {
  const s = await startServer(t, { env: ON });
  const r = await reg(s, { name: 'Hana' });
  assert.deepEqual(r.body.user, { id: r.body.user.id, name: 'Hana', admin: false });
  assert.deepEqual(s.db().users[0].role, undefined);
});

test('INVITE_ONLY still asks for the admin code', async t => {
  const s = await startServer(t, { env: { ...ON, INVITE_ONLY: '1' }, users: OLD });
  const r = await reg(s, { name: 'Ivo', as: 'trainer' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'invite');
  assert.equal((await s.call('/api/register/options', { method: 'POST', body: { name: 'Ivo', as: 'trainer' } })).body.code, 'invite');
  assert.equal(s.db().users.length, 1);
});

test('a trainer signing up with a passkey is pending too, phone included', async t => {
  const s = await startServer(t, { env: ON, users: OLD });
  const r = await regPasskey(s, { name: 'Jo', as: 'trainer', phone: '555' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id: r.body.user.id, name: 'Jo', admin: false, role: 'trainer', trainerStatus: 'pending' });
  assert.equal(s.db().users.find(u => u.id === r.body.user.id).phone, '555');
  assert.ok(audit(s).some(e => e.ev === 'trainer.signup' && e.uid === r.body.user.id));
});

test('the first passkey account on an empty server claims it as well', async t => {
  const s = await startServer(t, { env: { TRAINER_MODE: '1' } });
  const r = await regPasskey(s, { name: 'Kai', as: 'trainer' });
  assert.deepEqual(r.body.user, { id: r.body.user.id, name: 'Kai', admin: true, owner: true, role: 'trainer', trainerStatus: 'approved' });
});
