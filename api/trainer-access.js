/* Roles for the trainer and students mode, and the one question every trainer route asks.
 *
 * An account is a trainer (`role: 'trainer'`, waiting for an admin until `trainerStatus` is
 * 'approved'), a student (`role: 'student'`, tied to one trainer by `trainerId`), or neither, which
 * is how every account behaved before this mode existed. A trainer reaches a student's data only
 * through canAccessStudent, so the rule lives in one place and no route can forget half of it.
 *
 * Pure functions on `db.users`; the routes and the saving are server.js's. */

export const isApprovedTrainer = user => !!user && user.role === 'trainer' && user.trainerStatus === 'approved' && !user.disabled;
export const isPendingTrainer = user => !!user && user.role === 'trainer' && user.trainerStatus === 'pending';
export const isStudent = user => !!user && user.role === 'student';

// True only for an approved, active trainer and one of their own active students. A route answers
// false the same way as an unknown id (404), so a trainer cannot probe for other people's accounts.
export function canAccessStudent(db, trainer, studentId) {
  if (!isApprovedTrainer(trainer) || typeof studentId !== 'string') return false;
  const student = (db?.users || []).find(u => u.id === studentId);
  return isStudent(student) && !student.disabled && student.trainerId === trainer.id;
}

// When a trainer leaves (deleted, or no longer one), their students keep their accounts and data
// and just lose the link. Returns the ids it changed so the caller can audit them.
export function detachStudentsOf(db, trainerId) {
  const detached = [];
  for (const u of db?.users || []) {
    if (isStudent(u) && u.trainerId === trainerId) { delete u.trainerId; detached.push(u.id); }
  }
  return detached;
}
