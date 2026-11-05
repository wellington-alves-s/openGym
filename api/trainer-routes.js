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
import { createStudentInvite, dropStudentInvites } from './student-invite.js';

const STUDENT_PATH = /^\/api\/trainer\/students\/([^/]*)(\/invite|\/unlink)?$/;

// The route key for a per-student path, or null. Sets req.studentId to the segment as sent.
export function trainerStudentKey(req, pathname) {
  const m = STUDENT_PATH.exec(pathname);
  if (!m) return null;
  req.studentId = m[1];
  return `${req.method} /api/trainer/students/{id}${m[2] || ''}`;
}

const NOT_FOUND = { error: 'not found' };   // the dispatcher's own, so a refusal looks like no route
const view = r => ({ id: r.id, name: r.name, status: r.status, phone: r.phone || null, created: r.created, linkedAt: r.linkedAt || null });

export function trainerRoutes({ json, readBody, readSession, db, saveDb, audit, DATA, text }) {
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

  return {
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
