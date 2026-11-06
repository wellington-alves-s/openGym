/* The trainer's student records: one JSON file per student, never outside the trainer's folder. */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validId, readStudent, listStudents, writeStudent, removeStudent, removeTrainerDir, readRx, writeRx, removeRx } from '../trainer-store.js';

const T = 'trainer-0001';
const rec = (over = {}) => ({ id: 'student-0001', name: 'Ana', status: 'invited', created: 1000, ...over });

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'og-trainer-store-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const allFiles = d => fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.join(e.parentPath || e.path, e.name));

describe('trainer store', () => {
  it('writes and reads back, and _rev goes up on every write', () => {
    const a = writeStudent(dir, T, rec());
    assert.equal(a._rev, 1);
    assert.deepEqual(readStudent(dir, T, 'student-0001'), a);
    const b = writeStudent(dir, T, { ...a, status: 'active' });
    assert.equal(b._rev, 2);
    assert.equal(readStudent(dir, T, 'student-0001').status, 'active');
    assert.ok(fs.existsSync(path.join(dir, 'trainers', T, 'students', 'student-0001.json')));
  });

  it('ids with ../, empty, long, slashes or odd types never read or write outside the folder', () => {
    fs.writeFileSync(path.join(dir, 'secret.json'), '{"id":"secret-0001"}');
    const bad = ['..', '../x', '../../secret', 'a/b', 'a\\b', '/etc/passwd', 'C:\\x', '', 'short', 'x'.repeat(41), '%2e%2e%2fsecret', '..%2f..%2fsecret0', 'student-0001\n', 'student-0001.json', null, undefined, 42, {}, ['student-0001']];
    for (const id of bad) {
      assert.equal(validId(id), false, String(id));
      assert.equal(readStudent(dir, T, id), null, String(id));
      assert.equal(readStudent(dir, id, 'student-0001'), null, String(id));
      assert.throws(() => writeStudent(dir, T, rec({ id })), String(id));
      assert.throws(() => writeStudent(dir, id, rec()), String(id));
      assert.equal(removeStudent(dir, T, id), false, String(id));
    }
    assert.throws(() => writeStudent(dir, T, null));
    assert.deepEqual(listStudents(dir, '../x'), []);
    assert.equal(validId('student-0001'), true);
    assert.deepEqual(allFiles(dir), [path.join(dir, 'secret.json')]);
    assert.equal(fs.readFileSync(path.join(dir, 'secret.json'), 'utf8'), '{"id":"secret-0001"}');
  });

  it('listStudents skips a corrupt file without throwing and sorts by created, newest first', () => {
    writeStudent(dir, T, rec({ id: 'student-0001', created: 1000 }));
    writeStudent(dir, T, rec({ id: 'student-0002', created: 3000 }));
    writeStudent(dir, T, rec({ id: 'student-0003', created: 2000 }));
    fs.writeFileSync(path.join(dir, 'trainers', T, 'students', 'student-0004.json'), '{not json');
    assert.deepEqual(listStudents(dir, T).map(r => r.id), ['student-0002', 'student-0003', 'student-0001']);
    assert.deepEqual(listStudents(dir, 'trainer-0002'), []);
  });

  it('removeStudent deletes and answers true, then false', () => {
    writeStudent(dir, T, rec());
    assert.equal(removeStudent(dir, T, 'student-0001'), true);
    assert.equal(readStudent(dir, T, 'student-0001'), null);
    assert.equal(removeStudent(dir, T, 'student-0001'), false);
  });

  it('writeRx creates rx/, readRx gives the same document back, and _rev goes up on every write', () => {
    const doc = { draft: { bundle: { routines: [] }, updated: 1 }, versions: [], current: null };
    const a = writeRx(dir, T, 'student-0001', doc);
    assert.equal(a._rev, 1);
    assert.deepEqual(readRx(dir, T, 'student-0001'), a);
    assert.ok(fs.existsSync(path.join(dir, 'trainers', T, 'rx', 'student-0001.json')));
    assert.equal(writeRx(dir, T, 'student-0001', { ...a, current: 3 })._rev, 2);
    assert.equal(readRx(dir, T, 'student-0001').current, 3);
    assert.equal(readRx(dir, T, 'student-0002'), null);
  });

  it('hostile ids read null from rx, throw on write, and touch nothing outside', () => {
    for (const id of ['..', '../x', 'a/b', '', 'short', null, {}]) {
      assert.equal(readRx(dir, T, id), null, String(id));
      assert.equal(readRx(dir, id, 'student-0001'), null, String(id));
      assert.throws(() => writeRx(dir, T, id, {}), String(id));
      assert.throws(() => writeRx(dir, id, 'student-0001', {}), String(id));
      assert.equal(removeRx(dir, T, id), false, String(id));
    }
    assert.deepEqual(allFiles(dir), []);
  });

  it('removeRx deletes and answers true, then false; removeStudent takes the rx too', () => {
    writeRx(dir, T, 'student-0001', {});
    assert.equal(removeRx(dir, T, 'student-0001'), true);
    assert.equal(readRx(dir, T, 'student-0001'), null);
    assert.equal(removeRx(dir, T, 'student-0001'), false);
    writeStudent(dir, T, rec());
    writeRx(dir, T, 'student-0001', {});
    writeRx(dir, T, 'student-0002', {});
    removeStudent(dir, T, 'student-0001');
    assert.equal(readRx(dir, T, 'student-0001'), null);
    assert.notEqual(readRx(dir, T, 'student-0002'), null);
  });

  it('removeTrainerDir also takes the rx folder', () => {
    writeRx(dir, T, 'student-0001', {});
    assert.equal(removeTrainerDir(dir, T), true);
    assert.equal(readRx(dir, T, 'student-0001'), null);
  });

  it('removeTrainerDir takes the whole trainer folder, and nothing for a hostile id', () => {
    writeStudent(dir, T, rec());
    writeStudent(dir, 'trainer-0002', rec());
    fs.writeFileSync(path.join(dir, 'secret.json'), '{}');
    for (const id of ['..', '../trainers', '', 'short', null, {}, 'a/b']) assert.equal(removeTrainerDir(dir, id), false, String(id));
    assert.equal(allFiles(dir).length, 3);
    assert.equal(removeTrainerDir(dir, T), true);
    assert.equal(fs.existsSync(path.join(dir, 'trainers', T)), false);
    assert.equal(readStudent(dir, 'trainer-0002', 'student-0001').name, 'Ana');
    assert.equal(removeTrainerDir(dir, T), false);   // already gone
  });
});
