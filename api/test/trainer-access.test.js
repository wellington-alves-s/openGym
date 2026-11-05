/* Who may see whose data: the one check every trainer route goes through. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isApprovedTrainer, isPendingTrainer, isStudent, canAccessStudent, detachStudentsOf } from '../trainer-access.js';

const trainer = (over = {}) => ({ id: 't1', role: 'trainer', trainerStatus: 'approved', ...over });
const student = (over = {}) => ({ id: 's1', role: 'student', trainerId: 't1', name: 'Ana', consent: { at: 1 }, ...over });
const dbOf = (...users) => ({ users });

describe('role predicates', () => {
  it('approved trainer needs role, approval and an active account', () => {
    assert.equal(isApprovedTrainer(trainer()), true);
    assert.equal(isApprovedTrainer(trainer({ trainerStatus: 'pending' })), false);
    assert.equal(isApprovedTrainer(trainer({ disabled: true })), false);
    assert.equal(isApprovedTrainer({ id: 'x' }), false);
    assert.equal(isApprovedTrainer(null), false);
    assert.equal(isApprovedTrainer(undefined), false);
  });

  it('pending trainer', () => {
    assert.equal(isPendingTrainer(trainer({ trainerStatus: 'pending' })), true);
    assert.equal(isPendingTrainer(trainer()), false);
    assert.equal(isPendingTrainer({ id: 'x', trainerStatus: 'pending' }), false);
    assert.equal(isPendingTrainer(null), false);
  });

  it('student', () => {
    assert.equal(isStudent(student()), true);
    assert.equal(isStudent(trainer()), false);
    assert.equal(isStudent({ id: 'x' }), false);
    assert.equal(isStudent(null), false);
  });
});

describe('canAccessStudent', () => {
  it('lets an approved, active trainer in to their own active student', () => {
    assert.equal(canAccessStudent(dbOf(trainer(), student()), trainer(), 's1'), true);
  });

  it('refuses a pending or disabled trainer', () => {
    const db = dbOf(trainer(), student());
    assert.equal(canAccessStudent(db, trainer({ trainerStatus: 'pending' }), 's1'), false);
    assert.equal(canAccessStudent(db, trainer({ disabled: true }), 's1'), false);
  });

  it('refuses a user with no role', () => {
    assert.equal(canAccessStudent(dbOf(student()), { id: 't1' }, 's1'), false);
  });

  it('refuses another trainer\'s student', () => {
    const db = dbOf(trainer(), trainer({ id: 't2' }), student({ trainerId: 't2' }));
    assert.equal(canAccessStudent(db, trainer(), 's1'), false);
  });

  it('refuses an unknown id', () => {
    assert.equal(canAccessStudent(dbOf(trainer(), student()), trainer(), 'nope'), false);
  });

  it('refuses an account with no role, even with this trainerId', () => {
    const plain = { id: 'p1', trainerId: 't1' };
    assert.equal(canAccessStudent(dbOf(trainer(), plain), trainer(), 'p1'), false);
  });

  it('refuses a disabled student', () => {
    assert.equal(canAccessStudent(dbOf(trainer(), student({ disabled: true })), trainer(), 's1'), false);
  });

  it('refuses a missing trainer, a missing db or a non-string id', () => {
    const db = dbOf(trainer(), student());
    assert.equal(canAccessStudent(db, null, 's1'), false);
    assert.equal(canAccessStudent(db, undefined, 's1'), false);
    assert.equal(canAccessStudent({}, trainer(), 's1'), false);
    assert.equal(canAccessStudent(db, trainer(), undefined), false);
  });

  it('refuses a trainer without an id, even against a student with no trainerId', () => {
    const noId = { role: 'trainer', trainerStatus: 'approved' };
    const undef = student({ trainerId: undefined });
    const deleted = student(); delete deleted.trainerId;
    assert.equal(canAccessStudent(dbOf(noId, undef), noId, 's1'), false);
    assert.equal(canAccessStudent(dbOf(noId, deleted), noId, 's1'), false);
  });

  it('does not let a trainer reach themselves or another trainer', () => {
    assert.equal(canAccessStudent(dbOf(trainer(), trainer({ id: 't2' })), trainer(), 't2'), false);
  });
});

describe('detachStudentsOf', () => {
  it('drops trainerId from that trainer\'s students only and keeps the rest', () => {
    const mine = student();
    const other = student({ id: 's2', trainerId: 't2' });
    const db = dbOf(trainer(), mine, other);
    assert.deepEqual(detachStudentsOf(db, 't1'), ['s1']);
    assert.equal('trainerId' in db.users[1], false);
    assert.equal(db.users[1].name, 'Ana');
    assert.deepEqual(db.users[1].consent, { at: 1 });
    assert.equal(db.users[1].role, 'student');
    assert.equal(db.users[2].trainerId, 't2');
  });

  it('does nothing without a trainer id (already-detached students are not affected)', () => {
    const detached = student(); delete detached.trainerId;
    const db = dbOf(detached);
    assert.deepEqual(detachStudentsOf(db, undefined), []);
    assert.deepEqual(detachStudentsOf(db, ''), []);
  });

  it('returns an empty list when there is nothing to detach', () => {
    assert.deepEqual(detachStudentsOf(dbOf(trainer()), 't1'), []);
    assert.deepEqual(detachStudentsOf({}, 't1'), []);
  });
});
