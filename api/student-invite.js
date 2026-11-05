/* Single-use student invites (trainer mode).
 *
 * A trainer adds a student and gets a code, and a link that carries it, to hand over by message.
 * The student redeems it by signing up (or signing in) and is then linked to that trainer. Until
 * then the code is the whole credential, so, like a device link (device-link.js):
 *
 *   - 12 characters from the pairing alphabet, typed as XXXX-XXXX-XXXX (makeLinkCode is reused);
 *   - stored only as a SHA-256, under its own prefix so a device-link code never redeems an invite
 *     and the other way round: a copy of db.json holds no code that works;
 *   - one live invite per student — a new one replaces the one before — good for
 *     STUDENT_INVITE_TTL_MS and gone with the first use. An expired one is dropped the next time
 *     invites are read.
 *
 * Pure bookkeeping on `db.studentInvites`; the routes, the throttle and the audit are server.js's. */
import crypto from 'node:crypto';
import { makeLinkCode } from './device-link.js';

// A week: the code is sent by message and may sit unread for days, unlike a device link.
export const STUDENT_INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
const LENGTH = 12;

// Dashes, spaces and case are how a person types it, not part of it.
const clean = code => (typeof code === 'string' ? code : '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashInviteCode = code => crypto.createHash('sha256').update('opengym-join:' + clean(code)).digest('hex');

function prune(db, now) {
  db.studentInvites = (db.studentInvites || []).filter(i => i && typeof i.h === 'string' && i.exp > now);
}

// → { code, invite }. The code is returned once and never stored.
export function createStudentInvite(db, trainerId, studentId, now = Date.now()) {
  prune(db, now);
  db.studentInvites = db.studentInvites.filter(i => i.studentId !== studentId);
  const code = makeLinkCode();
  const invite = { h: hashInviteCode(code), trainerId, studentId, exp: now + STUDENT_INVITE_TTL_MS, created: now };
  db.studentInvites.push(invite);
  return { code, invite };
}

// The live invite a code belongs to, or null — a wrong code, a used one and an expired one all look
// the same from outside. Finding an invite does not use it up; burnStudentInvite does.
export function findStudentInvite(db, code, now = Date.now()) {
  prune(db, now);
  if (clean(code).length !== LENGTH) return null;
  const h = Buffer.from(hashInviteCode(code), 'hex');
  return db.studentInvites.find(i => {
    const stored = Buffer.from(i.h, 'hex');
    return stored.length === h.length && crypto.timingSafeEqual(stored, h);
  }) || null;
}

export function burnStudentInvite(db, invite) {
  db.studentInvites = (db.studentInvites || []).filter(i => i !== invite);
}

// Every unused invite of a trainer and/or student, for when a link ends (student removed, trainer
// gone). Says whether anything went, so a caller can skip a save.
export function dropStudentInvites(db, { trainerId, studentId } = {}) {
  if (trainerId === undefined && studentId === undefined) return false; // an empty filter must not wipe everything
  const before = (db.studentInvites || []).length;
  db.studentInvites = (db.studentInvites || []).filter(i =>
    !((trainerId === undefined || i.trainerId === trainerId) && (studentId === undefined || i.studentId === studentId)));
  return db.studentInvites.length !== before;
}
