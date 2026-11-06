/* A trainer's side of the prescription: draft, publish, restore and read a version, plus who may touch it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './trainer-harness.mjs';

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const USERS = [
  user('trainer01', 'Coach One', { role: 'trainer', trainerStatus: 'approved' }),
  user('trainer02', 'Coach Two', { role: 'trainer', trainerStatus: 'approved' }),
  user('student01', 'Student', { role: 'student', trainerId: 'trainer01' }),
  user('student02', 'Waiting', { role: 'student', trainerId: 'trainer01' }),
  user('student03', 'Gone', { role: 'student', trainerId: 'trainer01' }),
  user('trainer03', 'Coach Pending', { role: 'trainer', trainerStatus: 'pending' })
];
const rec = (id, status) => JSON.stringify({ id, name: id, status, created: 1, linkedAt: 2, _rev: 1 });
const files = {
  'trainers/trainer01/students/student01.json': rec('student01', 'active'),
  'trainers/trainer01/students/student02.json': rec('student02', 'invited'),
  'trainers/trainer01/students/student03.json': rec('student03', 'unlinked')
};
const ON = { env: { TRAINER_MODE: '1' }, users: USERS, files };
const NOT_FOUND = { error: 'not found' };
const base = '/api/trainer/students/student01/rx';
const bundle = (...exIds) => ({
  opengym_plan: 1, unit: 'kg', week: { 1: 'r1' },
  routines: [{ id: 'r1', name: 'A', ex: exIds.map(id => ({ id })) }], customEx: []
});
const rxFile = s => path.join(s.dir, 'trainers/trainer01/rx/student01.json');
const onDisk = s => JSON.parse(fs.readFileSync(rxFile(s), 'utf8'));
const prog = (...bundles) => ({ start: null, phases: bundles.map((b, i) => ({ id: 'p' + (i + 1), name: 'Phase ' + (i + 1), weeks: 4, bundle: b })) });
const put = (s, b, _rev, as = 'trainer01') => s.call(base + '/draft', { method: 'PUT', body: { program: prog(b), _rev }, as });
const putOld = (s, b, _rev) => s.call(base + '/draft', { method: 'PUT', body: { bundle: b, _rev }, as: 'trainer01' });
const publish = (s, _rev, note = '') => s.call(base + '/publish', { method: 'POST', body: { note, _rev }, as: 'trainer01' });

test('a student who never had a plan reads an empty draft and no current version', async t => {
  const s = await startServer(t, ON);
  const r = await s.call(base, { as: 'trainer01' });
  assert.equal(r.status, 200);
  assert.equal(r.body.rx._rev, 0);
  assert.equal(r.body.rx.current, null);
  assert.deepEqual(r.body.rx.draft.program.phases[0].bundle.routines, []);
  assert.deepEqual(r.body.rx.versions, []);
});

test('saving the draft needs the revision it was read at; a stale one is a 409 with the current plan', async t => {
  const s = await startServer(t, ON);
  const a = await put(s, bundle('ex1'), 0);
  assert.equal(a.status, 200);
  assert.equal(a.body.rx._rev, 1);
  assert.equal(onDisk(s).draft.program.phases[0].bundle.routines[0].ex[0].id, 'ex1');
  const before = fs.readFileSync(rxFile(s), 'utf8');
  const b = await put(s, bundle('ex2'), 0);
  assert.equal(b.status, 409);
  assert.equal(b.body.code, 'conflict');
  assert.equal(b.body.rx._rev, 1);
  assert.equal(b.body.rx.draft.program.phases[0].bundle.routines[0].ex[0].id, 'ex1');
  assert.equal(fs.readFileSync(rxFile(s), 'utf8'), before);
});

test('a bundle that breaks the limits is a 400 with its code and changes nothing', async t => {
  const s = await startServer(t, ON);
  const many = bundle('ex1');
  many.routines = Array.from({ length: 31 }, (_, i) => ({ id: 'r' + i, name: 'R', ex: [{ id: 'x' }] }));
  many.week = {};
  const r = await put(s, many, 0);
  assert.deepEqual([r.status, r.body.code], [400, 'too-many-routines']);
  assert.equal(fs.existsSync(rxFile(s)), false);
  assert.equal((await put(s, 'nope', 0)).body.code, 'bad-bundle');   // a phase whose bundle is not one
  assert.equal((await putOld(s, 'nope', 0)).body.code, 'bad-bundle');
  assert.equal((await put(s, bundle('ex1'), 'x')).status, 400);   // _rev has to be a number
});

test('publishing an empty draft is a 400 empty-draft; publishing numbers the versions 1 and 2', async t => {
  const s = await startServer(t, ON);
  const e = await publish(s, 0);
  assert.deepEqual([e.status, e.body.code], [400, 'empty-draft']);
  let rev = (await put(s, bundle('ex1'), 0)).body.rx._rev;
  const p1 = await publish(s, rev, 'first');
  assert.equal(p1.status, 200);
  assert.equal(p1.body.v, 1);
  assert.equal(p1.body.rx.current, 1);
  rev = p1.body.rx._rev;
  rev = (await put(s, bundle('ex1', 'ex2'), rev)).body.rx._rev;
  const p2 = await publish(s, rev);
  assert.equal(p2.body.v, 2);
  assert.deepEqual(p2.body.rx.versions.map(v => [v.v, v.note]), [[1, 'first'], [2, '']]);
  assert.equal(p2.body.rx.versions[0].bundle, undefined);   // the view never carries bundles
  assert.equal((await publish(s, rev)).status, 409);   // stale
  const audit = fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8');
  assert.match(audit, /"ev":"rx\.publish"[^\n]*v2/);
});

test('restoring a version writes only the draft; versions/{v} serves the bundle, an unknown one is 404', async t => {
  const s = await startServer(t, ON);
  let rev = (await put(s, bundle('ex1'), 0)).body.rx._rev;
  rev = (await publish(s, rev)).body.rx._rev;
  rev = (await put(s, bundle('ex9'), rev)).body.rx._rev;
  const r = await s.call(base + '/restore', { method: 'POST', body: { v: 1, _rev: rev }, as: 'trainer01' });
  assert.equal(r.status, 200);
  assert.equal(r.body.rx.draft.program.phases[0].bundle.routines[0].ex[0].id, 'ex1');
  assert.equal(r.body.rx.current, 1);
  assert.equal(r.body.rx.versions.length, 1);
  assert.equal(onDisk(s).versions.length, 1);
  assert.match(fs.readFileSync(path.join(s.dir, 'audit.log'), 'utf8'), /"ev":"rx\.restore"/);
  const bad = await s.call(base + '/restore', { method: 'POST', body: { v: 9, _rev: r.body.rx._rev }, as: 'trainer01' });
  assert.equal(bad.status, 404);
  assert.equal((await s.call(base + '/restore', { method: 'POST', body: { v: 'x', _rev: r.body.rx._rev }, as: 'trainer01' })).status, 400);
  const v1 = await s.call(base + '/versions/1', { as: 'trainer01' });
  assert.equal(v1.status, 200);
  assert.deepEqual(Object.keys(v1.body.version).sort(), ['at', 'note', 'program', 'v']);
  assert.equal(v1.body.version.program.phases[0].bundle.routines[0].ex[0].id, 'ex1');
  assert.equal((await s.call(base + '/versions/9', { as: 'trainer01' })).status, 404);
  assert.equal((await s.call(base + '/versions/abc', { as: 'trainer01' })).status, 404);
});

test('a stale publish or restore is a 409 and leaves the file as it was', async t => {
  const s = await startServer(t, ON);
  let rev = (await put(s, bundle('ex1'), 0)).body.rx._rev;
  rev = (await publish(s, rev)).body.rx._rev;
  await put(s, bundle('ex2'), rev);
  const before = fs.readFileSync(rxFile(s), 'utf8');
  assert.equal((await publish(s, rev)).status, 409);
  const r = await s.call(base + '/restore', { method: 'POST', body: { v: 1, _rev: rev }, as: 'trainer01' });
  assert.deepEqual([r.status, r.body.code], [409, 'conflict']);
  assert.equal(fs.readFileSync(rxFile(s), 'utf8'), before);
});

const ROUTES = [
  ['GET', base], ['PUT', base + '/draft'], ['POST', base + '/publish'], ['POST', base + '/restore'], ['GET', base + '/versions/1']
];
const bodyFor = p => p.endsWith('/draft') ? { program: prog(bundle('ex1')), _rev: 0 } : { v: 1, note: '', _rev: 0 };

test('who may touch the plan: another trainer and a student get 404, nobody 401, an unlinked-yet student 400', async t => {
  const s = await startServer(t, ON);
  for (const [method, p] of ROUTES) {
    const body = method === 'GET' ? undefined : bodyFor(p);
    for (const as of ['trainer02', 'student01']) {
      const r = await s.call(p, { method, body, as });
      assert.deepEqual([r.status, r.body], [404, NOT_FOUND], `${method} ${p} as ${as}`);
    }
    assert.equal((await s.call(p, { method, body })).status, 401, `${method} ${p}`);
    const w = await s.call(p.replace('student01', 'student02'), { method, body, as: 'trainer01' });
    assert.deepEqual([w.status, w.body.code], [400, 'not-linked'], `${method} ${p} invited`);
    const gone = await s.call(p.replace('student01', 'student03'), { method, body, as: 'trainer01' });
    assert.deepEqual([gone.status, gone.body.code], [400, 'not-linked'], `${method} ${p} unlinked`);
    const pending = await s.call(p, { method, body, as: 'trainer03' });
    assert.equal(pending.status, 403, `${method} ${p} pending trainer`);
    const h = await s.call(p.replace('student01', '..%2f..'), { method, body, as: 'trainer01' });
    assert.deepEqual([h.status, h.body], [404, NOT_FOUND], `${method} ${p} hostile`);
    const u = await s.call(p.replace('student01', 'nobody999'), { method, body, as: 'trainer01' });
    assert.deepEqual([u.status, u.body], [404, NOT_FOUND], `${method} ${p} unknown`);
  }
  assert.equal(fs.existsSync(rxFile(s)), false);
});

test('with trainer mode off every plan route is a plain 404', async t => {
  const s = await startServer(t, { users: USERS, files });
  for (const [method, p] of ROUTES) {
    const r = await s.call(p, { method, body: method === 'GET' ? undefined : bodyFor(p), as: 'trainer01' });
    assert.equal(r.status, 404, `${method} ${p}`);
  }
});

test('PUT draft takes a program and answers with it', async t => {
  const s = await startServer(t, ON);
  const p = { start: '2026-11-09', phases: [{ id: 'base', name: 'Base', weeks: 4, bundle: bundle('ex1') }, { id: 'peak', name: 'Peak', weeks: 2, bundle: bundle('ex2') }] };
  const r = await s.call(base + '/draft', { method: 'PUT', body: { program: p, _rev: 0 }, as: 'trainer01' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.rx.draft.program, p);
  assert.deepEqual(onDisk(s).draft.program, p);
});

test('the stage 2a body { bundle } is wrapped as a one-phase program p1; program wins when both come', async t => {
  const s = await startServer(t, ON);
  const r = await putOld(s, bundle('ex1'), 0);
  assert.equal(r.status, 200);
  const ph = r.body.rx.draft.program.phases;
  assert.deepEqual(ph.map(x => x.id), ['p1']);
  assert.equal(ph[0].bundle.routines[0].ex[0].id, 'ex1');
  const both = await s.call(base + '/draft', { method: 'PUT', body: { program: prog(bundle('exP')), bundle: bundle('exB'), _rev: r.body.rx._rev }, as: 'trainer01' });
  assert.equal(both.status, 200);
  assert.equal(both.body.rx.draft.program.phases[0].bundle.routines[0].ex[0].id, 'exP');
});

test('a body with neither program nor bundle, or a bad program, is a 400 with its code and writes nothing', async t => {
  const s = await startServer(t, ON);
  const send = body => s.call(base + '/draft', { method: 'PUT', body, as: 'trainer01' });
  const code = async body => { const r = await send(body); assert.equal(r.status, 400); return r.body.code; };
  assert.equal(await code({ _rev: 0 }), 'bad-program');
  assert.equal(await code({ program: 'x', _rev: 0 }), 'bad-program');
  assert.equal(await code({ program: { start: null, phases: [] }, _rev: 0 }), 'bad-program');
  const many = prog(...Array.from({ length: 25 }, () => bundle('ex1')));
  assert.equal(await code({ program: many, _rev: 0 }), 'too-many-phases');
  assert.equal(await code({ program: { ...prog(bundle('ex1')), start: '2026-02-30' }, _rev: 0 }), 'bad-start');
  const dup = prog(bundle('ex1'), bundle('ex1')); dup.phases[1].id = 'p1';
  assert.equal(await code({ program: dup, _rev: 0 }), 'bad-phase');
  assert.equal(fs.existsSync(rxFile(s)), false);
});

const oldDoc = (current) => JSON.stringify({
  _rev: 3, draft: { bundle: bundle('old-draft'), updated: 5 }, current,
  versions: [{ v: 1, at: 10, note: 'one', bundle: bundle('old-v1') }]
});

test('a stage 2a file on disk reads as a one-phase program, and saving rewrites it in the new shape', async t => {
  const s = await startServer(t, { ...ON, files: { ...files, 'trainers/trainer01/rx/student01.json': oldDoc(1) } });
  const r = await s.call(base, { as: 'trainer01' });
  assert.equal(r.status, 200);
  assert.equal(r.body.rx.draft.program.phases.length, 1);
  assert.equal(r.body.rx.draft.program.phases[0].bundle.routines[0].ex[0].id, 'old-draft');
  const v = await s.call(base + '/versions/1', { as: 'trainer01' });
  assert.equal(v.body.version.program.phases[0].bundle.routines[0].ex[0].id, 'old-v1');
  assert.equal(v.body.version.bundle, undefined);
  assert.equal(r.body.rx.draft.bundle.routines[0].ex[0].id, 'old-draft');   // a stage 2a app reads this
  const w = await put(s, bundle('new'), 3);
  assert.equal(w.status, 200);
  assert.equal(onDisk(s).draft.bundle, undefined);
  assert.equal(onDisk(s).draft.program.phases[0].bundle.routines[0].ex[0].id, 'new');
});

test('GET rx of a one-phase program carries program and bundle; of a several-phase one, program only', async t => {
  const s = await startServer(t, ON);
  const one = await put(s, bundle('ex1'), 0);
  const r1 = await s.call(base, { as: 'trainer01' });
  assert.deepEqual(r1.body.rx.draft.bundle, bundle('ex1'));
  assert.deepEqual(r1.body.rx.draft.program.phases[0].bundle, bundle('ex1'));
  await s.call(base + '/draft', { method: 'PUT', body: { program: prog(bundle('ex1'), bundle('ex2')), _rev: one.body.rx._rev }, as: 'trainer01' });
  const r2 = await s.call(base, { as: 'trainer01' });
  assert.equal(r2.body.rx.draft.program.phases.length, 2);
  assert.equal('bundle' in r2.body.rx.draft, false);
});

test('a stage 2a app saving { bundle } over a one-phase program keeps its id, name, weeks and the start', async t => {
  const s = await startServer(t, ON);
  const p = { start: '2026-11-09', phases: [{ id: 'base', name: 'Base', weeks: 6, bundle: bundle('ex1') }] };
  const w = await s.call(base + '/draft', { method: 'PUT', body: { program: p, _rev: 0 }, as: 'trainer01' });
  const r = await putOld(s, bundle('ex9'), w.body.rx._rev);
  assert.equal(r.status, 200);
  assert.deepEqual(onDisk(s).draft.program, { ...p, phases: [{ ...p.phases[0], bundle: bundle('ex9') }] });
  assert.equal(r.body.rx.draft.bundle.routines[0].ex[0].id, 'ex9');
});

test('a bare bundle on a several-phase draft: a stale _rev is a 409, a current one becomes the one phase p1', async t => {
  const s = await startServer(t, ON);
  const w = await s.call(base + '/draft', { method: 'PUT', body: { program: { ...prog(bundle('ex1'), bundle('ex2')), start: '2026-11-09' }, _rev: 0 }, as: 'trainer01' });
  const stale = await putOld(s, bundle('ex9'), 0);
  assert.equal(stale.status, 409);
  assert.equal(onDisk(s).draft.program.phases.length, 2);
  const r = await putOld(s, bundle('ex9'), w.body.rx._rev);
  assert.equal(r.status, 200);
  assert.deepEqual(onDisk(s).draft.program, { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: bundle('ex9') }] });
});

test('publishing a two-phase program numbers the version and keeps both phases', async t => {
  const s = await startServer(t, ON);
  const w = await s.call(base + '/draft', { method: 'PUT', body: { program: prog(bundle('ex1'), bundle('ex2')), _rev: 0 }, as: 'trainer01' });
  const p = await publish(s, w.body.rx._rev);
  assert.deepEqual([p.status, p.body.v], [200, 1]);
  assert.equal(onDisk(s).versions[0].program.phases.length, 2);
  const v = await s.call(base + '/versions/1', { as: 'trainer01' });
  assert.equal(v.body.version.program.phases.length, 2);
});
