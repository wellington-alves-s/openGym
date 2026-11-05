/* Redeeming a student invite (/api/join/{code}): public routes that make the student's account,
   by password or passkey, link it to the trainer and burn the code. A wrong, used and expired code,
   and one whose trainer can no longer take students, all answer the same 404. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './trainer-harness.mjs';
import { softPasskey } from './soft-passkey.mjs';
import { createStudentInvite } from '../student-invite.js';

const PW = 'correct horse battery staple';
const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const USERS = [
  user('coachAAA', 'Coach Ana', { role: 'trainer', trainerStatus: 'approved' }),
  user('pwholder', 'Taken Name', { pw: { h: 'not-a-real-hash', set: new Date().toISOString() } })
];
const ON = { TRAINER_MODE: '1', PASSWORD_LOGIN: '1' };
const NOT_FOUND = { error: 'not found' };
const SHARES = ['workouts', 'measures', 'photos', 'diet'];

// A student added by the trainer, through the route: → { id, code }.
async function addStudent(s, name = 'Rita') {
  const r = await s.call('/api/trainer/students', { method: 'POST', body: { name }, as: 'coachAAA' });
  assert.equal(r.status, 200);
  return { id: r.body.student.id, code: r.body.code };
}
const joinPw = (s, code, body = {}) => s.call(`/api/join/${code}/password`, { method: 'POST', body: { password: PW, ...body } });
async function joinPasskey(s, code, body = {}) {
  const opt = await s.call(`/api/join/${code}/options`, { method: 'POST', body: { name: body.name } });
  if (opt.status !== 200) return opt;
  return s.call(`/api/join/${code}/verify`, { method: 'POST', body: { cid: opt.body.cid, credential: softPasskey().attestation(opt.body.options.challenge), consent: body.consent } });
}
const audit = s => fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const rawDb = s => fs.readFileSync(path.join(s.dir, 'db.json'), 'utf8');
const bare = code => code.replace(/-/g, '');
// A record on disk for an invite seeded straight into db.json (no route makes those).
function writeRecord(s, trainerId, id, name = 'Seeded') {
  const dir = path.join(s.dir, 'trainers', trainerId, 'students');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ id, name, status: 'invited', created: 1, _rev: 1 }));
}

test('the whole flow by password: preview, account, me, the trainer list, and the code is spent', async t => {
  const s = await startServer(t, { env: ON, users: USERS });
  const { id, code } = await addStudent(s);

  const pre = await s.call(`/api/join/${code}`);
  assert.equal(pre.status, 200);
  assert.deepEqual(pre.body, { trainerName: 'Coach Ana', studentName: 'Rita', shares: SHARES });

  const r = await joinPw(s, code, { consent: { measures: true, photos: false, diet: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id, name: 'Rita', admin: false, role: 'student', trainer: { name: 'Coach Ana' } });
  assert.match(r.headers.get('set-cookie'), /gymsid=/);

  const me = await s.call('/api/me', { as: id });
  assert.equal(me.body.user.role, 'student');
  assert.deepEqual(me.body.user.trainer, { name: 'Coach Ana' });

  const row = s.db().users.find(u => u.id === id);
  assert.equal(row.trainerId, 'coachAAA');
  assert.equal(typeof row.pw.h, 'string');
  assert.equal(row.consent.measures, true);
  assert.equal(row.consent.photos, false);
  assert.equal(row.consent.diet, true);
  assert.ok(!Number.isNaN(Date.parse(row.consent.at)));

  const list = await s.call('/api/trainer/students', { as: 'coachAAA' });
  const st = list.body.students.find(x => x.id === id);
  assert.equal(st.status, 'active');
  assert.equal(typeof st.linkedAt, 'number');

  assert.deepEqual((await s.call(`/api/join/${code}`)).body, NOT_FOUND);
  assert.equal((await joinPw(s, code, { name: 'Someone Else' })).status, 404);

  const ev = audit(s).filter(e => e.ev === 'student.join');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].uid, id);
  const log = fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8');
  for (const c of [code, bare(code)]) {
    assert.equal(log.includes(c), false, 'code in the audit log');
    assert.equal(rawDb(s).includes(c), false, 'code in db.json');
  }
});

test('two redemptions of one code at once make exactly one account', async t => {
  const s = await startServer(t, { env: ON, users: USERS });
  const { id, code } = await addStudent(s);
  const rs = await Promise.all([joinPw(s, code), joinPw(s, code)]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 404]);
  assert.deepEqual(rs.find(r => r.status === 404).body, NOT_FOUND);
  assert.equal(s.db().users.filter(u => u.id === id).length, 1);
  assert.equal(s.db().users.length, USERS.length + 1);
});

test('two passkey redemptions at once make exactly one account', async t => {
  const s = await startServer(t, { env: ON, users: USERS });
  const { id, code } = await addStudent(s);
  const rs = await Promise.all([joinPasskey(s, code), joinPasskey(s, code)]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 404]);
  assert.equal(s.db().users.filter(u => u.id === id).length, 1);
  assert.equal(s.db().creds.length, 1);
});

test('a wrong, an expired and a used code answer the same 404', async t => {
  const expired = createStudentInvite({}, 'coachAAA', 'expired01', Date.now() - 8 * 86400000);
  const s = await startServer(t, { env: ON, users: USERS, seed: { studentInvites: [expired.invite] } });
  writeRecord(s, 'coachAAA', 'expired01');
  const used = await addStudent(s);
  assert.equal((await joinPw(s, used.code)).status, 200);

  const answers = [];
  for (const code of ['AAAA-BBBB-CCCC', expired.code, used.code]) {
    for (const r of [await s.call(`/api/join/${code}`), await joinPw(s, code, { name: 'Other' }),
      await s.call(`/api/join/${code}/options`, { method: 'POST', body: {} })]) {
      answers.push([r.status, r.body]);
    }
  }
  for (const a of answers) assert.deepEqual(a, [404, NOT_FOUND]);
  assert.equal(s.db().users.length, USERS.length + 1);
});

test('a taken name is 409 name-taken and keeps the invite; another name then goes through', async t => {
  const s = await startServer(t, { env: ON, users: USERS });
  const { id, code } = await addStudent(s, 'Taken Name');
  const r = await joinPw(s, code);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'name-taken');
  assert.equal((await s.call(`/api/join/${code}`)).status, 200);
  assert.equal(s.db().users.length, USERS.length);

  const ok = await joinPw(s, code, { name: 'Rita B' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.name, 'Rita B');
  assert.equal(ok.body.user.id, id);
});

test('a trainer disabled, no longer one, pending or gone: 404 and no account', async t => {
  const trainers = [
    user('coachOFF', 'Off', { role: 'trainer', trainerStatus: 'approved', disabled: true }),
    user('coachDEM', 'Demoted'),
    user('coachPEN', 'Pending', { role: 'trainer', trainerStatus: 'pending' })
  ];
  const seeded = ['coachOFF', 'coachDEM', 'coachPEN', 'coachGON'].map((tid, i) => ({ tid, sid: 'student0' + i, ...createStudentInvite({}, tid, 'student0' + i) }));
  const s = await startServer(t, { env: ON, users: [...USERS, ...trainers], seed: { studentInvites: seeded.map(x => x.invite) } });
  for (const x of seeded) {
    writeRecord(s, x.tid, x.sid);
    assert.deepEqual((await s.call(`/api/join/${x.code}`)).body, NOT_FOUND, x.tid);
    const r = await joinPw(s, x.code);
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], x.tid);
    assert.equal((await joinPasskey(s, x.code)).status, 404, x.tid);
  }
  assert.equal(s.db().users.length, USERS.length + trainers.length);
});

test('INVITE_ONLY does not apply: no admin code is asked for', async t => {
  const s = await startServer(t, { env: { ...ON, INVITE_ONLY: '1' }, users: USERS });
  const { code } = await addStudent(s);
  assert.equal((await joinPw(s, code)).status, 200);
  const other = await addStudent(s, 'Bea');
  assert.equal((await joinPasskey(s, other.code)).status, 200);
});

test('by passkey: options then verify make the account with its passkey', async t => {
  const s = await startServer(t, { env: { TRAINER_MODE: '1' }, users: USERS });
  const { id, code } = await addStudent(s);
  const r = await joinPasskey(s, code, { name: 'Rita P', consent: { photos: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.user, { id, name: 'Rita P', admin: false, role: 'student', trainer: { name: 'Coach Ana' } });
  assert.match(r.headers.get('set-cookie'), /gymsid=/);
  const row = s.db().users.find(u => u.id === id);
  assert.equal(row.pw, undefined);
  assert.deepEqual({ ...row.consent, at: 0 }, { measures: false, photos: true, diet: false, at: 0 });
  assert.equal(s.db().creds.filter(c => c.userId === id).length, 1);
  assert.equal((await s.call(`/api/join/${code}`)).status, 404);
});

test('a challenge from elsewhere does not verify a join', async t => {
  const s = await startServer(t, { env: { TRAINER_MODE: '1' }, users: USERS });
  const { code } = await addStudent(s);
  const reg = await s.call('/api/register/options', { method: 'POST', body: { name: 'Zed' } });
  const r = await s.call(`/api/join/${code}/verify`, { method: 'POST', body: { cid: reg.body.cid, credential: softPasskey().attestation(reg.body.options.challenge) } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'challenge-expired');
  // And a join challenge is spent on another code's path as a 404.
  const other = await addStudent(s, 'Bea');
  const opt = await s.call(`/api/join/${code}/options`, { method: 'POST', body: {} });
  const x = await s.call(`/api/join/${other.code}/verify`, { method: 'POST', body: { cid: opt.body.cid, credential: softPasskey().attestation(opt.body.options.challenge) } });
  assert.deepEqual([x.status, x.body], [404, NOT_FOUND]);
  assert.equal(s.db().users.length, USERS.length);
});

test('too many wrong codes from one address: 429 locked, even for a good code', async t => {
  const s = await startServer(t, { env: ON, users: USERS });
  const { code } = await addStudent(s);
  let r;
  for (let i = 0; i < 30; i++) {
    r = await s.call('/api/join/AAAA-BBBB-CCCC');
    if (r.status === 429) break;
    assert.equal(r.status, 404);
  }
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'locked');
  assert.equal((await s.call(`/api/join/${code}`)).status, 429);
  assert.equal((await joinPw(s, code)).status, 429);
  assert.equal(s.db().users.length, USERS.length);
});

test('consent: absent is all false, and only true counts as true', async t => {
  const s = await startServer(t, { env: ON, users: USERS });
  const a = await addStudent(s, 'Ana S');
  const b = await addStudent(s, 'Bia S');
  assert.equal((await joinPw(s, a.code)).status, 200);
  assert.equal((await joinPw(s, b.code, { consent: { measures: 'true', photos: 1, diet: true, extra: true } })).status, 200);
  const consent = id => { const c = s.db().users.find(u => u.id === id).consent; assert.equal(typeof c.at, 'string'); return { ...c, at: 0 }; };
  assert.deepEqual(consent(a.id), { measures: false, photos: false, diet: false, at: 0 });
  assert.deepEqual(consent(b.id), { measures: false, photos: false, diet: true, at: 0 });
});

test('the password way needs PASSWORD_LOGIN, and none of it exists without TRAINER_MODE', async t => {
  const s = await startServer(t, { env: { TRAINER_MODE: '1' }, users: USERS });
  const { code } = await addStudent(s);
  assert.equal((await joinPw(s, code)).status, 404);
  assert.equal((await s.call(`/api/join/${code}`)).status, 200);

  const off = await startServer(t, { env: { PASSWORD_LOGIN: '1' }, users: USERS });
  for (const r of [await off.call(`/api/join/${code}`), await joinPw(off, code), await off.call(`/api/join/${code}/options`, { method: 'POST', body: {} })]) {
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND]);
  }
});
