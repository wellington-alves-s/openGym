/* A trainer's models: reusable monthly plans kept in the trainer's profile, and who may touch them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './trainer-harness.mjs';

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const USERS = [
  user('trainer01', 'Coach One', { role: 'trainer', trainerStatus: 'approved' }),
  user('trainer02', 'Coach Two', { role: 'trainer', trainerStatus: 'approved' }),
  user('trainer03', 'Coach Pending', { role: 'trainer', trainerStatus: 'pending' }),
  user('student01', 'Student', { role: 'student', trainerId: 'trainer01' }),
  user('plain0001', 'Plain')
];
const ON = { env: { TRAINER_MODE: '1' }, users: USERS };
const NOT_FOUND = { error: 'not found' };
const bundle = (...exIds) => ({
  opengym_plan: 1, unit: 'kg', week: { 1: 'r1' },
  routines: [{ id: 'r1', name: 'A', ex: exIds.map(id => ({ id })) }], customEx: []
});
const file = (s, who = 'trainer01') => path.join(s.dir, 'trainers', who, 'profile.json');
const create = (s, name = 'Cut', b = bundle('ex1'), as = 'trainer01') => s.call('/api/trainer/models', { method: 'POST', body: { name, bundle: b }, as });
const put = (s, id, body, as = 'trainer01') => s.call('/api/trainer/models/' + id, { method: 'PUT', body, as });

test('creating a model answers it with a fresh id and _rev 1; it is listed with counts and no bundle, and read back whole', async t => {
  const s = await startServer(t, ON);
  const a = await create(s, '  Cut  ', { ...bundle('ex1', 'ex2'), routines: [{ id: 'r1', name: 'A', ex: [{ id: 'ex1' }, { id: 'ex2' }] }, { id: 'r2', name: 'B', ex: [{ id: 'ex3' }] }] });
  assert.equal(a.status, 200);
  const m = a.body.model;
  assert.match(m.id, /^[A-Za-z0-9_-]{16}$/);
  assert.deepEqual([m.name, m._rev, typeof m.updated], ['Cut', 1, 'number']);
  assert.equal(m.bundle.routines.length, 2);

  const list = await s.call('/api/trainer/models', { as: 'trainer01' });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.models, [{ id: m.id, name: 'Cut', updated: m.updated, routines: 2, exercises: 3 }]);
  assert.equal(JSON.stringify(list.body).includes('bundle'), false);

  const got = await s.call('/api/trainer/models/' + m.id, { as: 'trainer01' });
  assert.deepEqual(got.body, { model: m });
});

test('PUT renames, swaps the bundle or both, and each change takes _rev up by one', async t => {
  const s = await startServer(t, ON);
  const m = (await create(s)).body.model;
  const r1 = await put(s, m.id, { name: 'Bulk', _rev: 1 });
  assert.deepEqual([r1.status, r1.body.model.name, r1.body.model._rev], [200, 'Bulk', 2]);
  assert.equal(r1.body.model.bundle.routines[0].ex[0].id, 'ex1');
  const r2 = await put(s, m.id, { bundle: bundle('ex9'), _rev: 2 });
  assert.deepEqual([r2.status, r2.body.model.name, r2.body.model._rev], [200, 'Bulk', 3]);
  assert.equal(r2.body.model.bundle.routines[0].ex[0].id, 'ex9');
  const r3 = await put(s, m.id, { name: 'Maintain', bundle: bundle('ex5'), _rev: 3 });
  assert.deepEqual([r3.body.model.name, r3.body.model._rev, r3.body.model.bundle.routines[0].ex[0].id], ['Maintain', 4, 'ex5']);
  assert.deepEqual((await s.call('/api/trainer/models/' + m.id, { as: 'trainer01' })).body.model, r3.body.model);
});

test('a stale _rev is a 409 with the current model and the file stays identical', async t => {
  const s = await startServer(t, ON);
  const m = (await create(s)).body.model;
  await put(s, m.id, { name: 'Bulk', _rev: 1 });
  const before = fs.readFileSync(file(s), 'utf8');
  const r = await put(s, m.id, { name: 'Lost', _rev: 1 });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'conflict');
  assert.deepEqual([r.body.model.name, r.body.model._rev], ['Bulk', 2]);
  assert.equal(r.body.model.bundle.routines[0].ex[0].id, 'ex1');
  assert.equal(fs.readFileSync(file(s), 'utf8'), before);
});

test('each model has its own _rev: changing one does not make the other stale', async t => {
  const s = await startServer(t, ON);
  const a = (await create(s, 'A')).body.model;
  const b = (await create(s, 'B')).body.model;
  await put(s, a.id, { name: 'A2', _rev: 1 });
  assert.equal((await put(s, b.id, { name: 'B2', _rev: 1 })).status, 200);
});

test('bad input: names, bundles, _rev and an empty PUT are 400s that change nothing', async t => {
  const s = await startServer(t, ON);
  for (const name of ['', '   ', 'x'.repeat(41), null, 5]) {
    const r = await create(s, name);
    assert.deepEqual([r.status, r.body.code], [400, 'bad-name'], String(name));
  }
  assert.equal((await create(s, 'x'.repeat(40))).status, 200);   // 40 is the limit
  assert.equal((await create(s, 'A', 'nope')).body.code, 'bad-bundle');
  assert.equal((await create(s, 'A', { ...bundle('ex1'), customEx: [{ id: 'mine' }] })).body.code, 'bad-bundle');
  assert.equal((await create(s, 'A', null)).body.code, 'bad-bundle');
  const many = bundle('ex1');
  many.routines = Array.from({ length: 31 }, (_, i) => ({ id: 'r' + i, name: 'R', ex: [{ id: 'x' }] }));
  many.week = {};
  const r = await create(s, 'A', many);
  assert.deepEqual([r.status, r.body.code], [400, 'too-many-routines']);

  const m = (await create(s, 'Ok')).body.model;
  const before = fs.readFileSync(file(s), 'utf8');
  for (const _rev of [undefined, '1', 1.5, null]) assert.equal((await put(s, m.id, { name: 'Z', _rev })).body.code, 'bad-rev', String(_rev));
  assert.equal((await put(s, m.id, { _rev: 1 })).body.code, 'bad-model');
  assert.equal((await put(s, m.id, { name: '', _rev: 1 })).body.code, 'bad-name');
  assert.equal((await put(s, m.id, { name: 'y'.repeat(41), _rev: 1 })).body.code, 'bad-name');
  assert.equal((await put(s, m.id, { name: 5, _rev: 1 })).body.code, 'bad-name');
  assert.equal((await put(s, m.id, { name: null, _rev: 1 })).body.code, 'bad-name');
  assert.equal((await put(s, m.id, { bundle: 'nope', _rev: 1 })).body.code, 'bad-bundle');
  assert.equal(fs.readFileSync(file(s), 'utf8'), before);
});

test('a profile.json that cannot be read is a 500 on every model route and is never overwritten', async t => {
  for (const bad of ['{ not json', '[1, 2]', '"x"', JSON.stringify({ models: 'x' }), 'null']) {
    const s = await startServer(t, { ...ON, files: { 'trainers/trainer01/profile.json': bad } });
    const calls = [
      ['/api/trainer/models', {}],
      ['/api/trainer/models', { method: 'POST', body: { name: 'A', bundle: bundle('ex1') } }],
      ['/api/trainer/models/abcdefghijklmnop', { method: 'PUT', body: { name: 'B', _rev: 1 } }],
      ['/api/trainer/models/abcdefghijklmnop', { method: 'DELETE' }]
    ];
    for (const [p, o] of calls) assert.equal((await s.call(p, { ...o, as: 'trainer01' })).status, 500, `${bad} ${o.method || 'GET'}`);
    assert.equal(fs.readFileSync(file(s), 'utf8'), bad);
  }
});

test('a profile.json that is a directory is a 500, a missing one is an empty list', async t => {
  const s = await startServer(t, ON);
  assert.deepEqual((await s.call('/api/trainer/models', { as: 'trainer01' })).body, { models: [] });
  fs.mkdirSync(file(s), { recursive: true });
  assert.equal((await s.call('/api/trainer/models', { as: 'trainer01' })).status, 500);
  assert.equal((await create(s)).status, 500);
  assert.equal(fs.statSync(file(s)).isDirectory(), true);
});

test('deleting removes the model; a second delete and a read are 404', async t => {
  const s = await startServer(t, ON);
  const m = (await create(s)).body.model;
  const d = await s.call('/api/trainer/models/' + m.id, { method: 'DELETE', as: 'trainer01' });
  assert.deepEqual([d.status, d.body], [200, { ok: true }]);
  assert.deepEqual((await s.call('/api/trainer/models', { as: 'trainer01' })).body.models, []);
  assert.equal((await s.call('/api/trainer/models/' + m.id, { as: 'trainer01' })).status, 404);
  assert.equal((await s.call('/api/trainer/models/' + m.id, { method: 'DELETE', as: 'trainer01' })).status, 404);
});

test('the 101st model is a 400 too-many-models; deleting one makes room', async t => {
  const models = Array.from({ length: 100 }, (_, i) => ({ id: 'model-' + String(i).padStart(4, '0'), name: 'M' + i, updated: 1, _rev: 1, bundle: bundle('ex1') }));
  const s = await startServer(t, { ...ON, files: { 'trainers/trainer01/profile.json': JSON.stringify({ models }) } });
  const r = await create(s);
  assert.deepEqual([r.status, r.body.code], [400, 'too-many-models']);
  assert.equal(JSON.parse(fs.readFileSync(file(s), 'utf8')).models.length, 100);
  await s.call('/api/trainer/models/model-0000', { method: 'DELETE', as: 'trainer01' });
  assert.equal((await create(s)).status, 200);
});

test('permissions: another trainer sees nothing of the model, and cannot read, change or delete it', async t => {
  const s = await startServer(t, ON);
  const m = (await create(s)).body.model;
  await create(s, 'Mine two', bundle('ex2'), 'trainer02');
  const before = fs.readFileSync(file(s), 'utf8');
  const other = (await s.call('/api/trainer/models', { as: 'trainer02' })).body.models;
  assert.deepEqual(other.map(x => x.name), ['Mine two']);
  const url = '/api/trainer/models/' + m.id;
  for (const r of [
    await s.call(url, { as: 'trainer02' }),
    await put(s, m.id, { name: 'Hijack', _rev: 1 }, 'trainer02'),
    await s.call(url, { method: 'DELETE', as: 'trainer02' })
  ]) assert.deepEqual([r.status, r.body], [404, NOT_FOUND]);
  assert.equal(fs.readFileSync(file(s), 'utf8'), before);
  assert.equal(fs.readFileSync(file(s, 'trainer02'), 'utf8').includes('Hijack'), false);
});

test('permissions: a student, an account with no role, no session, a pending trainer and a hostile id', async t => {
  const s = await startServer(t, ON);
  const m = (await create(s)).body.model;
  const calls = as => [
    ['/api/trainer/models', {}], ['/api/trainer/models/' + m.id, {}],
    ['/api/trainer/models', { method: 'POST', body: { name: 'X', bundle: bundle('e') } }],
    ['/api/trainer/models/' + m.id, { method: 'PUT', body: { name: 'X', _rev: 1 } }],
    ['/api/trainer/models/' + m.id, { method: 'DELETE' }]
  ].map(([p, o]) => s.call(p, { ...o, as }));
  for (const who of ['student01', 'plain0001']) for (const r of await Promise.all(calls(who))) assert.deepEqual([r.status, r.body], [404, NOT_FOUND], who);
  for (const r of await Promise.all(calls(undefined))) assert.equal(r.status, 401);
  for (const r of await Promise.all(calls('trainer03'))) assert.deepEqual([r.status, r.body.code], [403, 'trainer-pending']);
  for (const id of ['..%2f..%2fsecret', 'a%5cb', 'x']) {
    for (const [method, body] of [['GET'], ['PUT', { name: 'X', _rev: 1 }], ['DELETE']]) {
      const r = await s.call('/api/trainer/models/' + id, { method, body, as: 'trainer01' });
      assert.equal(r.status, 404, `${method} ${id}`);
    }
  }
  assert.equal((await s.call('/api/trainer/models', { as: 'trainer01' })).body.models.length, 1);
});

test('with TRAINER_MODE off every model route is a 404', async t => {
  const s = await startServer(t, { users: USERS });
  for (const [p, method] of [['/api/trainer/models', 'GET'], ['/api/trainer/models', 'POST'], ['/api/trainer/models/abcdefgh12', 'GET'], ['/api/trainer/models/abcdefgh12', 'PUT'], ['/api/trainer/models/abcdefgh12', 'DELETE']]) {
    const r = await s.call(p, { method, body: method === 'GET' ? undefined : {}, as: 'trainer01' });
    assert.deepEqual([r.status, r.body], [404, NOT_FOUND], `${method} ${p}`);
  }
});

test('create, update and delete are audited', async t => {
  const s = await startServer(t, ON);
  const m = (await create(s)).body.model;
  await put(s, m.id, { name: 'Bulk', _rev: 1 });
  await s.call('/api/trainer/models/' + m.id, { method: 'DELETE', as: 'trainer01' });
  const audit = fs.readdirSync(s.dir).filter(n => /audit/i.test(n)).map(n => fs.readFileSync(path.join(s.dir, n), 'utf8')).join('\n');
  for (const ev of ['model.create', 'model.update', 'model.delete']) assert.ok(audit.includes(ev), ev);
});
