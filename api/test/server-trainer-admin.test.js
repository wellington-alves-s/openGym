/* The owner's side of trainer mode: list the trainers, approve or reject a pending one, and switch
   trainer mode on a single account. Admins see the list; everything that changes an account is the
   owner's. Rejecting removes the account the way the admin's delete does. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './trainer-harness.mjs';

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const USERS = [
  user('owner001', 'Owner', { admin: true, owner: true }),
  user('admin001', 'Admin', { admin: true }),
  user('plain001', 'Plain', { email: 'plain@example.com' }),
  user('coachAAA', 'Coach Ana', { role: 'trainer', trainerStatus: 'approved', phone: '+55 11 9999', email: 'ana@example.com' }),
  user('wait0001', 'Waiting', { role: 'trainer', trainerStatus: 'pending', phone: '+55 11 8888' }),
  user('stud0001', 'Student', { role: 'student', trainerId: 'coachAAA' })
];
const ON = { env: { TRAINER_MODE: '1' }, users: USERS };
const post = (s, p, body, as) => s.call(p, { method: 'POST', body, as });
const byId = (s, id) => s.db().users.find(u => u.id === id);

function seedStudent(s, trainerId, id, status) {
  const dir = path.join(s.dir, 'trainers', trainerId, 'students');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, name: id, status, created: 1, _rev: 1 }));
}

test('the routes do not exist without TRAINER_MODE', async t => {
  const s = await startServer(t, { users: USERS });
  assert.equal((await s.call('/api/admin/trainers', { as: 'owner001' })).status, 404);
  assert.equal((await post(s, '/api/admin/trainer/approve', { id: 'wait0001' }, 'owner001')).status, 404);
});

test('GET /api/admin/trainers: admins only, pending and approved, counts and no contact details', async t => {
  const s = await startServer(t, ON);
  seedStudent(s, 'coachAAA', 'stud0001', 'active');
  seedStudent(s, 'coachAAA', 'inv00001', 'invited');
  seedStudent(s, 'coachAAA', 'gone0001', 'unlinked');
  assert.equal((await s.call('/api/admin/trainers')).status, 401);
  assert.equal((await s.call('/api/admin/trainers', { as: 'plain001' })).status, 403);
  assert.equal((await s.call('/api/admin/trainers', { as: 'coachAAA' })).status, 403);
  for (const who of ['owner001', 'admin001']) {
    const r = await s.call('/api/admin/trainers', { as: who });
    assert.equal(r.status, 200);
    const list = [...r.body.trainers].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(list.map(x => [x.id, x.name, x.status, x.students]), [['coachAAA', 'Coach Ana', 'approved', 2], ['wait0001', 'Waiting', 'pending', 0]]);
    assert.deepEqual(Object.keys(list[0]).sort(), ['created', 'id', 'name', 'status', 'students']);
    assert.ok(!JSON.stringify(r.body).includes('example.com') && !JSON.stringify(r.body).includes('+55'));
  }
});

test('approve, reject and user/trainer: 403 for a plain account and for an admin who is not the owner', async t => {
  const s = await startServer(t, ON);
  const calls = [['/api/admin/trainer/approve', { id: 'wait0001' }], ['/api/admin/trainer/reject', { id: 'wait0001' }], ['/api/admin/user/trainer', { id: 'plain001', on: true }]];
  for (const who of ['plain001', 'admin001', 'wait0001']) {
    for (const [p, body] of calls) assert.equal((await post(s, p, body, who)).status, 403, `${who} ${p}`);
  }
  assert.equal((await post(s, calls[0][0], calls[0][1])).status, 401);
  assert.equal(byId(s, 'wait0001').trainerStatus, 'pending');
  assert.equal(byId(s, 'plain001').role, undefined);
});

test('approve turns pending into approved and the trainer gets in', async t => {
  const s = await startServer(t, ON);
  assert.equal((await s.call('/api/trainer/students', { as: 'wait0001' })).status, 403);
  const r = await post(s, '/api/admin/trainer/approve', { id: 'wait0001' }, 'owner001');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(byId(s, 'wait0001').trainerStatus, 'approved');
  assert.equal((await s.call('/api/trainer/students', { as: 'wait0001' })).status, 200);
  assert.match(fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8'), /"ev":"trainer\.approve".*"tgt":"wait0001"/);
});

test('approve: unknown id 404, missing or hostile id 404, anything that is not pending 400', async t => {
  const s = await startServer(t, ON);
  for (const id of ['nobody00', undefined, null, 7, {}, ['wait0001'], '__proto__']) {
    assert.equal((await post(s, '/api/admin/trainer/approve', { id }, 'owner001')).status, 404, String(id));
  }
  for (const id of ['coachAAA', 'stud0001', 'plain001']) {
    assert.equal((await post(s, '/api/admin/trainer/approve', { id }, 'owner001')).status, 400, id);
  }
});

test('reject deletes the pending account and what was theirs', async t => {
  const s = await startServer(t, {
    env: ON.env,
    users: USERS,
    seed: { creds: [{ id: 'c1', userId: 'wait0001', publicKey: 'x' }], subs: [{ endpoint: 'https://push/w', userId: 'wait0001' }] }
  });
  fs.writeFileSync(path.join(s.dir, 'state-wait0001.json'), '{"_rev":1}');
  seedStudent(s, 'wait0001', 'inv00001', 'invited');   // no route makes one while pending; a folder left from before
  const r = await post(s, '/api/admin/trainer/reject', { id: 'wait0001' }, 'owner001');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true });
  const db = s.db();
  assert.ok(!db.users.some(u => u.id === 'wait0001'));
  assert.ok(!db.creds.some(c => c.userId === 'wait0001'));
  assert.ok(!db.subs.some(x => x.userId === 'wait0001'));
  assert.ok(!fs.existsSync(path.join(s.dir, 'state-wait0001.json')));
  assert.ok(!fs.existsSync(path.join(s.dir, 'trainers', 'wait0001')));
  assert.equal(db.users.length, USERS.length - 1);
  const log = fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8');
  assert.match(log, /"ev":"trainer\.reject"/);
  assert.ok(!log.includes('+55 11 8888'));
});

test('reject: only a pending trainer; an approved one, a student, a plain account and unknown ids are refused', async t => {
  const s = await startServer(t, ON);
  for (const id of ['coachAAA', 'stud0001', 'plain001']) assert.equal((await post(s, '/api/admin/trainer/reject', { id }, 'owner001')).status, 400, id);
  for (const id of ['nobody00', undefined, 7]) assert.equal((await post(s, '/api/admin/trainer/reject', { id }, 'owner001')).status, 404, String(id));
  assert.equal(s.db().users.length, USERS.length);
});

test('the owner turns trainer mode on for their own account', async t => {
  const s = await startServer(t, ON);
  const r = await post(s, '/api/admin/user/trainer', { id: 'owner001', on: true }, 'owner001');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, id: 'owner001', role: 'trainer' });
  const me = byId(s, 'owner001');
  assert.equal(me.role, 'trainer');
  assert.equal(me.trainerStatus, 'approved');
  assert.equal(me.admin, true);
  assert.equal((await s.call('/api/trainer/students', { as: 'owner001' })).status, 200);
  assert.match(fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8'), /"ev":"trainer\.mode"/);
});

test('turning it on for another account, and for a pending trainer, approves them', async t => {
  const s = await startServer(t, ON);
  assert.equal((await post(s, '/api/admin/user/trainer', { id: 'plain001', on: true }, 'owner001')).status, 200);
  assert.equal((await post(s, '/api/admin/user/trainer', { id: 'wait0001', on: true }, 'owner001')).status, 200);
  assert.deepEqual([byId(s, 'plain001').role, byId(s, 'plain001').trainerStatus], ['trainer', 'approved']);
  assert.equal(byId(s, 'wait0001').trainerStatus, 'approved');
});

test('user/trainer on: a student is refused (400); bad input is 404 or 400', async t => {
  const s = await startServer(t, ON);
  assert.equal((await post(s, '/api/admin/user/trainer', { id: 'stud0001', on: true }, 'owner001')).status, 400);
  assert.equal(byId(s, 'stud0001').role, 'student');
  assert.equal((await post(s, '/api/admin/user/trainer', { id: 'nobody00', on: true }, 'owner001')).status, 404);
  assert.equal((await post(s, '/api/admin/user/trainer', { on: true }, 'owner001')).status, 404);
  for (const on of [undefined, 'true', 1, null]) assert.equal((await post(s, '/api/admin/user/trainer', { id: 'plain001', on }, 'owner001')).status, 400, String(on));
  assert.equal(byId(s, 'plain001').role, undefined);
});

test('user/trainer off removes the role and detaches the students; their accounts and data stay', async t => {
  const s = await startServer(t, ON);
  seedStudent(s, 'coachAAA', 'stud0001', 'active');
  seedStudent(s, 'coachAAA', 'inv00001', 'invited');
  const r = await post(s, '/api/admin/user/trainer', { id: 'coachAAA', on: false }, 'owner001');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, id: 'coachAAA', role: null });
  const db = s.db();
  const ana = db.users.find(u => u.id === 'coachAAA');
  assert.deepEqual([ana.role, ana.trainerStatus, ana.phone], [undefined, undefined, undefined]);
  assert.equal(ana.email, 'ana@example.com');
  const stu = db.users.find(u => u.id === 'stud0001');
  assert.equal(stu.role, 'student');
  assert.equal(stu.trainerId, undefined);
  const rec = id => JSON.parse(fs.readFileSync(path.join(s.dir, 'trainers', 'coachAAA', 'students', `${id}.json`), 'utf8'));
  assert.equal(rec('stud0001').status, 'unlinked');
  assert.equal(rec('inv00001').status, 'unlinked');
  // The former trainer is a plain account again.
  assert.equal((await s.call('/api/trainer/students', { as: 'coachAAA' })).status, 404);
});

test('user/trainer off on an account that is not a trainer is refused (400)', async t => {
  const s = await startServer(t, ON);
  for (const id of ['plain001', 'stud0001', 'owner001']) assert.equal((await post(s, '/api/admin/user/trainer', { id, on: false }, 'owner001')).status, 400, id);
  assert.equal(byId(s, 'stud0001').trainerId, 'coachAAA');
});

test('the owner who is a trainer can switch it off again and stays the owner', async t => {
  const s = await startServer(t, ON);
  await post(s, '/api/admin/user/trainer', { id: 'owner001', on: true }, 'owner001');
  const r = await post(s, '/api/admin/user/trainer', { id: 'owner001', on: false }, 'owner001');
  assert.equal(r.status, 200);
  const me = byId(s, 'owner001');
  assert.deepEqual([me.role, me.trainerStatus, me.admin, me.owner], [undefined, undefined, true, true]);
});

test('the sweep removes pending trainers left 30 days and nothing else, only with TRAINER_MODE', async t => {
  const old = new Date(Date.now() - 31 * 86400000).toISOString();
  const users = [
    user('owner001', 'Owner', { admin: true, owner: true }),
    user('stale001', 'Stale', { role: 'trainer', trainerStatus: 'pending', created: old }),
    user('fresh001', 'Fresh', { role: 'trainer', trainerStatus: 'pending' }),
    user('coachOld', 'Coach', { role: 'trainer', trainerStatus: 'approved', created: old }),
    user('studOld1', 'Student', { role: 'student', created: old }),
    user('plainOld', 'Plain', { created: old })
  ];
  const ids = db => db.users.map(u => u.id);
  const rec = id => JSON.stringify({ id, name: id, status: 'invited', created: 1, _rev: 1 });
  const files = { 'trainers/stale001/students/inv00001.json': rec('inv00001'), 'trainers/coachOld/students/inv00002.json': rec('inv00002') };
  const on = await startServer(t, { env: ON.env, users, files });
  assert.deepEqual(ids(on.db()), ['owner001', 'fresh001', 'coachOld', 'studOld1', 'plainOld']);
  assert.match(fs.readFileSync(path.join(on.dir, 'audit.log'), 'utf8'), /"ev":"trainer\.reject"/);
  assert.ok(!fs.existsSync(path.join(on.dir, 'trainers', 'stale001')));
  assert.ok(fs.existsSync(path.join(on.dir, 'trainers', 'coachOld', 'students', 'inv00002.json')));
  const off = await startServer(t, { users });
  assert.equal(off.db().users.length, users.length);
});
