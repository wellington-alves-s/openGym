/* HTTP surface for trainer mode: a trainer's students. Spread into server.js's route table only
 * when TRAINER_MODE is on, so with it off these paths answer 404 like any other unknown one.
 *
 * A factory taking server.js's own helpers, the way coach/routes.js does: they are closures over
 * the db and the session secret, and passing them in keeps this module free of a cycle.
 *
 * The `{id}` in the keys is filled in by the dispatcher (trainerStudentKey below), which leaves
 * the raw path segment on req.studentId. Every route goes through trainerGuard, and every route on
 * one student through studentGuard, so another trainer's student, a hostile id and an unknown one
 * all get the same 404. */
import crypto from 'node:crypto';
import { isApprovedTrainer, isPendingTrainer, canAccessStudent } from './trainer-access.js';
import { validId, readStudent, listStudents, writeStudent, removeStudent } from './trainer-store.js';
import { createStudentInvite, dropStudentInvites, findStudentInvite, burnStudentInvite } from './student-invite.js';

const STUDENT_PATH = /^\/api\/trainer\/students\/([^/]*)(\/invite|\/unlink)?$/;
const JOIN_PATH = /^\/api\/join\/([^/]+)(\/password|\/options|\/verify)?$/;

// The route key for a per-student path, or null. Sets req.studentId to the segment as sent.
export function trainerStudentKey(req, pathname) {
  const m = STUDENT_PATH.exec(pathname);
  if (!m) return null;
  req.studentId = m[1];
  return `${req.method} /api/trainer/students/{id}${m[2] || ''}`;
}

// The same for /api/join/{code}, the code left on req.joinCode. The key, never the path, is what
// the dispatcher logs, so the code stays out of the logs.
export function joinKey(req, pathname) {
  const m = JOIN_PATH.exec(pathname);
  if (!m) return null;
  req.joinCode = m[1];
  return `${req.method} /api/join/{code}${m[2] || ''}`;
}

const NOT_FOUND = { error: 'not found' };   // the dispatcher's own, so a refusal looks like no route
const view = r => ({ id: r.id, name: r.name, status: r.status, phone: r.phone || null, created: r.created, linkedAt: r.linkedAt || null });

// What a trainer lets a student share; workouts always, the rest by the student's consent.
const SHARES = ['workouts', 'measures', 'photos', 'diet'];
// Only a real `true` is a yes: anything else, a missing consent included, is a no.
const consentOf = c => ({ measures: c?.measures === true, photos: c?.photos === true, diet: c?.diet === true });

export function trainerRoutes({
  json, readBody, readSession, db, saveDb, audit, DATA, text,
  PASSWORD_LOGIN, addressPaused, strikeAddress, passwordProblem, policyError, hashPassword, nameTaken,
  putChallenge, takeChallenge, newPasskeyOptions, verifyNewPasskey, openAccount
}) {
  // readSession hands back the live db.users record, so the role checks see the current one.
  const trainerGuard = (req, res) => {
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    if (isPendingTrainer(user)) { json(res, 403, { error: 'waiting for approval', code: 'trainer-pending' }); return null; }
    if (!isApprovedTrainer(user)) { audit(req, 'trainer.denied', { ok: false, user }); json(res, 404, NOT_FOUND); return null; }
    return user;
  };
  // The record, or null after a 404. validId first: a hostile id never reaches a path.
  const studentGuard = (req, res, trainer, id) => {
    const rec = validId(id) ? readStudent(DATA, trainer.id, id) : null;
    // Once active, the account has to still be this trainer's too.
    if (rec && rec.id === id && (rec.status !== 'active' || canAccessStudent(db, trainer, id))) return rec;
    audit(req, 'trainer.denied', { ok: false, user: trainer });
    json(res, 404, NOT_FOUND);
    return null;
  };
  const trainerAndStudent = (req, res) => {
    const trainer = trainerGuard(req, res); if (!trainer) return null;
    const rec = studentGuard(req, res, trainer, req.studentId); if (!rec) return null;
    return { trainer, rec };
  };
  // The code goes back in this one answer and nowhere else (not db.json, not the audit).
  const invite = (req, trainer, rec) => {
    const { code } = createStudentInvite(db, trainer.id, rec.id);
    saveDb();
    audit(req, 'student.invite', { user: trainer, target: rec });
    return code;
  };

  /* ---------- redeeming an invite (public) ----------
     A wrong, used or expired code, a trainer who can no longer take students and a student who
     already has an account all look the same: one 404, one strike against the address. */
  // { inv, trainer, rec } while the code can still make this account, else null. No await inside,
  // so a route asks it again after its own awaits and writes straight after.
  const liveJoin = code => {
    const inv = findStudentInvite(db, code);
    const trainer = inv && db.users.find(u => u.id === inv.trainerId);
    if (!isApprovedTrainer(trainer) || db.users.some(u => u.id === inv.studentId)) return null;
    const rec = readStudent(DATA, trainer.id, inv.studentId);
    return rec && rec.status === 'invited' ? { inv, trainer, rec } : null;
  };
  const refuse = (req, res) => { strikeAddress(req, 'join'); json(res, 404, NOT_FOUND); };
  // The first look of every join route: null after a 429 or the 404.
  const openJoin = (req, res) => {
    if (addressPaused(req, res, 'join')) return null;
    const live = liveJoin(req.joinCode);
    if (!live) refuse(req, res);
    return live;
  };
  // A taken name counts against the address too: it also answers for sign-in e-mails (nameTaken).
  const nameRefused = (req, res, name) => {
    if (!nameTaken(name)) return false;
    strikeAddress(req, 'join');
    json(res, 409, { error: 'another profile already signs in with this name', code: 'name-taken' });
    return true;
  };
  const joinName = (body, rec) => text(body.name).trim().slice(0, 40) || rec.name;
  // The student's account, from a live invite checked with no await since. The record goes first:
  // if it cannot be written nothing else has changed and the code still works.
  const join = (req, res, { inv, trainer, rec }, name, consent, { h, passkey } = {}) => {
    const created = new Date().toISOString();
    const user = {
      id: inv.studentId, name, created, ...(h ? { pw: { h, set: created } } : {}),
      role: 'student', trainerId: trainer.id, consent: { ...consentOf(consent), at: created }
    };
    writeStudent(DATA, trainer.id, { ...rec, status: 'active', linkedAt: Date.now() });
    burnStudentInvite(db, inv);
    openAccount(req, res, user, passkey, 'student.join', { target: trainer, msg: passkey ? 'passkey' : 'password' });
  };
  const joinRoutes = {
    'GET /api/join/{code}': async (req, res) => {
      const live = openJoin(req, res); if (!live) return;
      json(res, 200, { trainerName: live.trainer.name, studentName: live.rec.name, shares: SHARES });
    },

    'POST /api/join/{code}/options': async (req, res) => {
      const body = await readBody(req);
      const live = openJoin(req, res); if (!live) return;
      const name = joinName(body, live.rec);
      if (nameRefused(req, res, name)) return;
      const options = await newPasskeyOptions(live.inv.studentId, name);
      // The invite's hash, never the code, ties the challenge to it.
      const cid = putChallenge({ kind: 'join', challenge: options.challenge, name, uid: live.inv.studentId, h: live.inv.h });
      json(res, 200, { cid, options });
    },

    'POST /api/join/{code}/verify': async (req, res) => {
      const body = await readBody(req);
      if (addressPaused(req, res, 'join')) return;
      const c = takeChallenge(text(body.cid));
      if (!c || c.kind !== 'join') return json(res, 400, { error: 'challenge expired, try again', code: 'challenge-expired' });
      const passkey = await verifyNewPasskey(req, res, c, body);
      if (!passkey) return;
      const live = liveJoin(req.joinCode);
      if (!live || live.inv.h !== c.h) return refuse(req, res);
      if (nameRefused(req, res, c.name)) return;
      join(req, res, live, c.name, body.consent, { passkey });
    },

    // Absent, like every password route, while PASSWORD_LOGIN is off.
    ...(PASSWORD_LOGIN ? {
      'POST /api/join/{code}/password': async (req, res) => {
        const body = await readBody(req);
        const first = openJoin(req, res); if (!first) return;
        const name = joinName(body, first.rec);
        const problem = passwordProblem(body.password, name);
        if (problem) return policyError(res, problem);
        if (nameRefused(req, res, name)) return;
        const h = await hashPassword(body.password);
        // The hash took a while: the code may be spent and the name taken by now.
        const live = liveJoin(req.joinCode);
        if (!live || live.inv !== first.inv) return refuse(req, res);
        if (nameRefused(req, res, name)) return;
        join(req, res, live, name, body.consent, { h });
      }
    } : {})
  };

  return {
    ...joinRoutes,

    'GET /api/trainer/students': async (req, res) => {
      const trainer = trainerGuard(req, res); if (!trainer) return;
      json(res, 200, { students: listStudents(DATA, trainer.id).map(view) });
    },

    'POST /api/trainer/students': async (req, res) => {
      const trainer = trainerGuard(req, res); if (!trainer) return;
      const body = await readBody(req);
      const name = text(body.name).trim();
      if (!name || name.length > 40) return json(res, 400, { error: 'name must be 1 to 40 characters', code: 'bad-name' });
      const phone = text(body.phone).trim().slice(0, 30);
      const email = text(body.email).trim().slice(0, 254);
      const rec = writeStudent(DATA, trainer.id, {
        id: crypto.randomBytes(12).toString('base64url'), name, status: 'invited', created: Date.now(),
        ...(phone ? { phone } : {}), ...(email ? { email } : {})
      });
      json(res, 200, { student: view(rec), code: invite(req, trainer, rec) });
    },

    'POST /api/trainer/students/{id}/invite': async (req, res) => {
      const g = trainerAndStudent(req, res); if (!g) return;
      if (g.rec.status !== 'invited') return json(res, 400, { error: 'this student is not waiting for an invite', code: 'not-invited' });
      json(res, 200, { code: invite(req, g.trainer, g.rec) });
    },

    'DELETE /api/trainer/students/{id}': async (req, res) => {
      const g = trainerAndStudent(req, res); if (!g) return;
      if (g.rec.status !== 'invited') return json(res, 400, { error: 'unlink this student instead', code: 'use-unlink' });
      removeStudent(DATA, g.trainer.id, g.rec.id);
      if (dropStudentInvites(db, { studentId: g.rec.id })) saveDb();
      json(res, 200, { ok: true });
    },

    'POST /api/trainer/students/{id}/unlink': async (req, res) => {
      const g = trainerAndStudent(req, res); if (!g) return;
      const { trainer, rec } = g;
      const account = db.users.find(u => u.id === rec.id && u.role === 'student' && u.trainerId === trainer.id);
      if (account) delete account.trainerId;
      dropStudentInvites(db, { studentId: rec.id });
      saveDb();   // the link is cut first: that is the part that guards the student's data
      writeStudent(DATA, trainer.id, { ...rec, status: 'unlinked', unlinkedAt: Date.now() });
      audit(req, 'student.unlink', { user: trainer, target: rec });
      json(res, 200, { ok: true });
    }
  };
}
