/* The student-invite bookkeeping: one live code per student, hashed at rest, good once and for
   seven days. The routes around it live in server.js. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStudentInvite, findStudentInvite, burnStudentInvite, dropStudentInvites, hashInviteCode, STUDENT_INVITE_TTL_MS } from '../student-invite.js';
import { createDeviceLink, hashLinkCode } from '../device-link.js';

describe('createStudentInvite', () => {
  it('issues a code bound to the student and keeps only its hash', () => {
    const db = {};
    const now = 1_700_000_000_000;
    const { code, invite } = createStudentInvite(db, 'trainer-a', 'student-1', now);
    assert.equal(invite.trainerId, 'trainer-a');
    assert.equal(invite.studentId, 'student-1');
    assert.equal(invite.exp, now + STUDENT_INVITE_TTL_MS);
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$/);
    assert.equal(db.studentInvites.length, 1);
    assert.equal(db.studentInvites[0].h, hashInviteCode(code));
    assert.doesNotMatch(JSON.stringify(db), new RegExp(code.replace(/-/g, '')));
    assert.doesNotMatch(JSON.stringify(db), new RegExp(code));
  });

  it('lasts seven days', () => {
    assert.equal(STUDENT_INVITE_TTL_MS, 7 * 24 * 3600 * 1000);
  });

  it('replaces the earlier invite of the same student', () => {
    const db = {};
    const first = createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    const second = createStudentInvite(db, 'trainer-a', 'student-1', 2000);
    assert.equal(db.studentInvites.length, 1);
    assert.equal(findStudentInvite(db, first.code, 2500), null);
    assert.equal(findStudentInvite(db, second.code, 2500), second.invite);
  });

  it('leaves another student of the same trainer alone', () => {
    const db = {};
    const a = createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    const b = createStudentInvite(db, 'trainer-a', 'student-2', 2000);
    assert.equal(db.studentInvites.length, 2);
    assert.equal(findStudentInvite(db, a.code, 2500), a.invite);
    assert.equal(findStudentInvite(db, b.code, 2500), b.invite);
  });
});

describe('findStudentInvite', () => {
  it('does not redeem a device-link code as a student invite', () => {
    const db = {};
    createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    const { code } = createDeviceLink(db, 'user-a', 1000);
    assert.notEqual(hashInviteCode(code), hashLinkCode(code));
    assert.equal(findStudentInvite(db, code, 2000), null);
    assert.equal(findStudentInvite(db, hashLinkCode(code), 2000), null);
  });

  it('answers a wrong, a used and an expired code the same way', () => {
    const db = {};
    const { code, invite } = createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    const wrong = code.startsWith('A') ? code.replace(/^./, 'B') : code.replace(/^./, 'A');
    assert.equal(findStudentInvite(db, wrong, 2000), null);
    assert.equal(findStudentInvite(db, code, 2000), invite);
    burnStudentInvite(db, invite);
    assert.equal(findStudentInvite(db, code, 2000), null);
    const late = createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    assert.equal(findStudentInvite(db, late.code, late.invite.exp + 1), null);
  });

  it('accepts a code typed with spaces, lower case and no dashes', () => {
    const db = {};
    const { code, invite } = createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    const typed = ' ' + code.replace(/-/g, '').toLowerCase().replace(/(.{4})/g, '$1 ');
    assert.equal(findStudentInvite(db, typed, 2000), invite);
  });
});

describe('dropStudentInvites', () => {
  it('removes every invite of a trainer and says so', () => {
    const db = {};
    createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    createStudentInvite(db, 'trainer-a', 'student-2', 1000);
    const keep = createStudentInvite(db, 'trainer-b', 'student-3', 1000);
    assert.equal(dropStudentInvites(db, { trainerId: 'trainer-a' }), true);
    assert.deepEqual(db.studentInvites, [keep.invite]);
    assert.equal(dropStudentInvites(db, { trainerId: 'trainer-a' }), false);
  });

  it('removes the invite of one student', () => {
    const db = {};
    createStudentInvite(db, 'trainer-a', 'student-1', 1000);
    const keep = createStudentInvite(db, 'trainer-a', 'student-2', 1000);
    assert.equal(dropStudentInvites(db, { studentId: 'student-1' }), true);
    assert.deepEqual(db.studentInvites, [keep.invite]);
  });
});
