/* A trainer's student records: one JSON file per student under
 * `<dir>/trainers/<trainerId>/students/<studentId>.json`.
 *
 * Both ids come from URLs, so every path is built only after validId passes: a hostile id reads as
 * "not there" (null, [], false) or throws on write, and never touches the disk. No routes here. */
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './durable.js';

export const ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
export const validId = id => typeof id === 'string' && ID_RE.test(id);

const studentsDir = (dir, trainerId) => path.join(dir, 'trainers', trainerId, 'students');

export function readStudent(dir, trainerId, studentId) {
  if (!validId(trainerId) || !validId(studentId)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(studentsDir(dir, trainerId), studentId + '.json'), 'utf8')); }
  catch { return null; }   // missing or unreadable
}

export function listStudents(dir, trainerId) {
  if (!validId(trainerId)) return [];
  let names;
  try { names = fs.readdirSync(studentsDir(dir, trainerId)); } catch { return []; }
  return names
    .filter(n => n.endsWith('.json'))
    .map(n => readStudent(dir, trainerId, n.slice(0, -5)))
    .filter(r => r && typeof r === 'object')
    .sort((a, b) => (b.created || 0) - (a.created || 0));
}

export function writeStudent(dir, trainerId, record) {
  if (!validId(trainerId) || !validId(record?.id)) throw new Error('bad-id');
  const folder = studentsDir(dir, trainerId);
  fs.mkdirSync(folder, { recursive: true });
  const next = { ...record, _rev: (readStudent(dir, trainerId, record.id)?._rev || 0) + 1 };
  atomicWrite(path.join(folder, record.id + '.json'), JSON.stringify(next), 0o600);
  return next;
}

// The trainer's whole folder, every record in it; only when the trainer account itself goes.
// → true when there was one to remove.
export function removeTrainerDir(dir, trainerId) {
  if (!validId(trainerId)) return false;
  const folder = path.join(dir, 'trainers', trainerId);
  if (!fs.existsSync(folder)) return false;
  fs.rmSync(folder, { recursive: true, force: true });
  return true;
}

// The prescription document, one file per student: `<dir>/trainers/<trainerId>/rx/<studentId>.json`.
const rxDir = (dir, trainerId) => path.join(dir, 'trainers', trainerId, 'rx');

export function readRx(dir, trainerId, studentId) {
  if (!validId(trainerId) || !validId(studentId)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(rxDir(dir, trainerId), studentId + '.json'), 'utf8')); }
  catch { return null; }
}

export function writeRx(dir, trainerId, studentId, rx) {
  if (!validId(trainerId) || !validId(studentId)) throw new Error('bad-id');
  const folder = rxDir(dir, trainerId);
  fs.mkdirSync(folder, { recursive: true });
  const next = { ...rx, _rev: (readRx(dir, trainerId, studentId)?._rev || 0) + 1 };
  atomicWrite(path.join(folder, studentId + '.json'), JSON.stringify(next), 0o600);
  return next;
}

export function removeRx(dir, trainerId, studentId) {
  if (!validId(trainerId) || !validId(studentId)) return false;
  try { fs.unlinkSync(path.join(rxDir(dir, trainerId), studentId + '.json')); return true; }
  catch { return false; }
}

// The trainer's own profile, `<dir>/trainers/<trainerId>/profile.json`: { models: [{ id, name, updated, _rev, bundle }] }.
// Always the whole file in and out; a missing or unreadable one is an empty profile.
const profileFile = (dir, trainerId) => path.join(dir, 'trainers', trainerId, 'profile.json');

export function readProfile(dir, trainerId) {
  if (!validId(trainerId)) return { models: [] };
  try {
    const p = JSON.parse(fs.readFileSync(profileFile(dir, trainerId), 'utf8'));
    return Array.isArray(p?.models) ? p : { models: [] };
  } catch { return { models: [] }; }
}

export function writeProfile(dir, trainerId, profile) {
  if (!validId(trainerId)) throw new Error('bad-id');
  fs.mkdirSync(path.join(dir, 'trainers', trainerId), { recursive: true });
  atomicWrite(profileFile(dir, trainerId), JSON.stringify(profile), 0o600);
  return profile;
}

export function removeStudent(dir, trainerId, studentId) {
  if (!validId(trainerId) || !validId(studentId)) return false;
  removeRx(dir, trainerId, studentId);
  try { fs.unlinkSync(path.join(studentsDir(dir, trainerId), studentId + '.json')); return true; }
  catch { return false; }
}
