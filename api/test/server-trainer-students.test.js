/* The trainer's student routes: list, add (with its invite), a new invite, remove and unlink. Who
   may call them (approved trainer only, pending gets 403, anyone else 404) and the rule that another
   trainer's student, a hostile id and an unknown one all answer the same 404. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './trainer-harness.mjs';

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const USERS = [
  user('plain001', 'Plain'),
  user('coachAAA', 'Coach Ana', { role: 'trainer', trainerStatus: 'approved' }),
  user('coachBBB', 'Coach Bia', { role: 'trainer', trainerStatus: 'approved' }),
  user('wait0001', 'Waiting', { role: 'trainer', trainerStatus: 'pending' }),
  user('stud0001', 'Student', { role: 'student', trainerId: 'coachAAA' })
];
const ON = { env: { TRAINER_MODE: '1' }, users: USERS };
const NOT_FOUND = { error: 'not found' };

// The record of an already active student, as the join flow (Task 7) will leave it.
function seedActive(s) {
  const dir = path.join(s.dir, 'trainers', 'coachAAA', 'students');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stud0001.json'), JSON.stringify({ id: 'stud0001', name: 'Student', status: 'active', created: 1, linkedAt: 2, _rev: 1 }));
}
const add = (s, as, name = 'Rita') => s.call('/api/trainer/students', { method: 'POST', body: { name, phone: '+55 11 9999' }, as });

test('a trainer adds a student and sees it listed; the code is in the answer only', async t => {
  const s = await startServer(t, ON);
  const r = await add(s, 'coachAAA');
  assert.equal(r.status, 200);
  assert.match(r.body.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const st = r.body.student;
  assert.match(st.id, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(st.name, 'Rita');
  assert.equal(st.status, 'invited');
  assert.equal(st.phone, '+55 11 9999');

  const list = await s.call('/api/trainer/students', { as: 'coachAAA' });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.students.map(x => [x.id, x.name, x.status]), [[st.id, 'Rita', 'invited']]);
  assert.deepEqual(Object.keys(list.body.students[0]).sort(), ['created', 'id', 'linkedAt', 'name', 'phone', 'status']);

  // The other trainer sees none of it.
  assert.deepEqual((await s.call('/api/trainer/students', { as: 'coachBBB' })).body, { students: [] });

  const raw = r.body.code.replace(/-/g, '');
  const dbText = fs.readFileSync(path.join(s.dir, 'db.json'), 'utf8');
  const auditText = fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8');
  for (const hay of [dbText, auditText]) {
    assert.ok(!hay.includes(r.body.code) && !hay.includes(raw), 'the invite code was written to disk');
  }
  assert.match(auditText, /"ev":"student\.invite"/);
  assert.equal(s.db().studentInvites.length, 1);
});

test('another trainer cannot reach the student: the same 404 as an unknown one', async t => {
  const s = await startServer(t, ON);
  seedActive(s);
  const { id } = (await add(s, 'coachAAA')).body.student;
  const unknown = 'nobody0000000000';
  for (const sid of [id, 'stud0001', unknown]) {
    for (const [p, method] of [[`/api/trainer/students/${sid}/invite`, 'POST'], [`/api/trainer/students/${sid}`, 'DELETE'], [`/api/trainer/students/${sid}/unlink`, 'POST']]) {
      const r = await s.call(p, { method, as: 'coachBBB' });
      assert.equal(r.status, 404, `${method} ${p}`);
      assert.deepEqual(r.body, NOT_FOUND);
    }
  }
  // Nothing moved for trainer A.
  assert.equal(s.db().users.find(u => u.id === 'stud0001').trainerId, 'coachAAA');
  assert.equal(s.db().studentInvites.length, 1);
  assert.equal((await s.call('/api/trainer/students', { as: 'coachAAA' })).body.students.length, 2);
  assert.match(fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8'), /"ev":"trainer\.denied"/);
});

test('a student and a roleless account get 404, nobody signed in gets 401', async t => {
  const s = await startServer(t, ON);
  for (const as of ['stud0001', 'plain001']) {
    const r = await s.call('/api/trainer/students', { as });
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, NOT_FOUND);
  }
  assert.equal((await s.call('/api/trainer/students')).status, 401);
  assert.equal((await add(s, undefined)).status, 401);
});

test('a pending trainer gets 403 trainer-pending on every route', async t => {
  const s = await startServer(t, ON);
  for (const [p, method] of [
    ['/api/trainer/students', 'GET'], ['/api/trainer/students', 'POST'],
    ['/api/trainer/students/abcdefgh12/invite', 'POST'], ['/api/trainer/students/abcdefgh12', 'DELETE'],
    ['/api/trainer/students/abcdefgh12/unlink', 'POST']
  ]) {
    const r = await s.call(p, { method, body: method === 'POST' ? { name: 'X' } : undefined, as: 'wait0001' });
    assert.equal(r.status, 403, `${method} ${p}`);
    assert.equal(r.body.code, 'trainer-pending');
  }
  assert.ok(!s.db().studentInvites?.length);
});

test('the name must be 1 to 40 characters after trimming', async t => {
  const s = await startServer(t, ON);
  for (const name of ['', '   ', 'x'.repeat(41), null, { x: 1 }]) {
    const r = await add(s, 'coachAAA', name);
    assert.equal(r.status, 400, String(name));
  }
  const ok = await add(s, 'coachAAA', '  ' + 'y'.repeat(40) + '  ');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.student.name, 'y'.repeat(40));
});

test('a new invite replaces the old one', async t => {
  const s = await startServer(t, ON);
  const first = (await add(s, 'coachAAA')).body;
  const again = await s.call(`/api/trainer/students/${first.student.id}/invite`, { method: 'POST', as: 'coachAAA' });
  assert.equal(again.status, 200);
  assert.match(again.body.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.notEqual(again.body.code, first.code);
  assert.equal(s.db().studentInvites.length, 1);
});

test('an invited student can be removed; an active one has to be unlinked', async t => {
  const s = await startServer(t, ON);
  seedActive(s);
  const { id } = (await add(s, 'coachAAA')).body.student;
  const del = await s.call(`/api/trainer/students/${id}`, { method: 'DELETE', as: 'coachAAA' });
  assert.deepEqual([del.status, del.body], [200, { ok: true }]);
  assert.equal(s.db().studentInvites.length, 0);
  assert.equal(fs.existsSync(path.join(s.dir, 'trainers', 'coachAAA', 'students', id + '.json')), false);

  const active = await s.call('/api/trainer/students/stud0001', { method: 'DELETE', as: 'coachAAA' });
  assert.equal(active.status, 400);
  assert.equal(active.body.code, 'use-unlink');
  // A new invite is only for one still waiting.
  assert.equal((await s.call('/api/trainer/students/stud0001/invite', { method: 'POST', as: 'coachAAA' })).status, 400);
});

test('unlink cuts the account loose and marks the record', async t => {
  const s = await startServer(t, ON);
  seedActive(s);
  const r = await s.call('/api/trainer/students/stud0001/unlink', { method: 'POST', as: 'coachAAA' });
  assert.deepEqual([r.status, r.body], [200, { ok: true }]);
  const account = s.db().users.find(u => u.id === 'stud0001');
  assert.equal('trainerId' in account, false);
  const rec = JSON.parse(fs.readFileSync(path.join(s.dir, 'trainers', 'coachAAA', 'students', 'stud0001.json'), 'utf8'));
  assert.equal(rec.status, 'unlinked');
  assert.equal(typeof rec.unlinkedAt, 'number');
  assert.match(fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8'), /"ev":"student\.unlink"/);
  // An invited student's code goes with the unlink.
  const { id } = (await add(s, 'coachAAA')).body.student;
  await s.call(`/api/trainer/students/${id}/unlink`, { method: 'POST', as: 'coachAAA' });
  assert.equal(s.db().studentInvites.length, 0);
});

test('hostile ids answer 404 and write nothing', async t => {
  const s = await startServer(t, ON);
  await add(s, 'coachAAA');   // the trainer's folder exists
  const files = () => fs.readdirSync(s.dir, { recursive: true }).map(String).filter(f => f !== 'audit.log').sort();
  const before = files();
  const ids = ['..%2Fx', '..%2F..%2Fdb', '', 'a'.repeat(200), '..'];
  for (const id of ids) {
    for (const [p, method] of [[`/api/trainer/students/${id}/invite`, 'POST'], [`/api/trainer/students/${id}`, 'DELETE'], [`/api/trainer/students/${id}/unlink`, 'POST']]) {
      const r = await s.call(p, { method, as: 'coachAAA' });
      assert.equal(r.status, 404, `${method} ${p}`);
    }
  }
  // fetch resolves a literal ../ before sending; it still lands on no route.
  assert.equal((await s.call('/api/trainer/students/../x/unlink', { method: 'POST', as: 'coachAAA' })).status, 404);
  assert.deepEqual(files(), before);
  assert.equal(s.db().studentInvites.length, 1);
});

test('without TRAINER_MODE the routes do not exist', async t => {
  const s = await startServer(t, { users: USERS });
  for (const p of ['/api/trainer/students', '/api/join/qualquer']) {
    const r = await s.call(p, { as: 'coachAAA' });
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND]);
  }
  assert.equal((await add(s, 'coachAAA')).status, 404);
});
