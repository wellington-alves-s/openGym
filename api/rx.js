/* The prescription document a trainer keeps for one student: a draft plus numbered published versions.
 *
 *   { _rev, draft: { program, updated }, versions: [ { v, at, note, program } ], current: v | null }
 *
 * `program` is { start: 'YYYY-MM-DD' | null, phases: [ { id, name, weeks, bundle } ] } and each `bundle` is a
 * plan bundle ({ opengym_plan, unit, week, routines, customEx }). Documents written by stage 2a hold a bare
 * `bundle` in the draft and in each version; programOf reads them as one phase and nothing is written back
 * in the old shape. Pure and structural only:
 * the API cannot import the frontend, so what is inside each exercise passes as it came and the app that
 * applies it cleans it (parsePlan). Every function returns a new document and never mutates its argument.
 * Errors carry a `.code`. No I/O here; the file lives in trainer-store.js. */

export const RX_LIMITS = { routines: 30, exercises: 60, bytes: 131072, versions: 50, phases: 24, programBytes: 262144, weeks: 52 };

export const EMPTY_BUNDLE = () => ({ opengym_plan: 1, unit: 'kg', week: {}, routines: [], customEx: [] });
export const EMPTY_PROGRAM = () => ({ start: null, phases: [{ id: 'p1', name: '', weeks: 4, bundle: EMPTY_BUNDLE() }] });
export const emptyRx = () => ({ _rev: 0, draft: { program: EMPTY_PROGRAM(), updated: 0 }, versions: [], current: null });

const ROUTINE_ID = /^[\w-]{1,64}$/;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

// → null when the bundle is fine, else the reason.
export function checkBundle(b) {
  if (!isObj(b)) return 'bad-bundle';
  let size;
  try { size = Buffer.byteLength(JSON.stringify(b)); } catch { return 'bad-bundle'; }
  if (size > RX_LIMITS.bytes) return 'too-big';
  if (b.opengym_plan !== 1 || (b.unit !== 'kg' && b.unit !== 'lb') || !Array.isArray(b.customEx) || b.customEx.length || !Array.isArray(b.routines)) return 'bad-bundle';
  if (b.routines.length > RX_LIMITS.routines) return 'too-many-routines';
  const ids = new Set();
  for (const r of b.routines) {
    if (!isObj(r) || typeof r.id !== 'string' || !ROUTINE_ID.test(r.id) || ids.has(r.id) || typeof r.name !== 'string' || !Array.isArray(r.ex)) return 'bad-bundle';
    if (r.ex.length > RX_LIMITS.exercises) return 'too-many-exercises';
    if (r.ex.some(x => !isObj(x) || typeof x.id !== 'string')) return 'bad-bundle';
    ids.add(r.id);
  }
  if (!isObj(b.week)) return 'bad-week';
  for (const [k, v] of Object.entries(b.week)) {
    if (!/^[0-6]$/.test(k)) return 'bad-week';
    const list = Array.isArray(v) ? v : [v];   // the app writes one id or a list
    if (list.some(id => typeof id !== 'string' || !ids.has(id))) return 'bad-week';
  }
  return null;
}

const fail = c => Object.assign(new Error(c), { code: c });
const clone = o => JSON.parse(JSON.stringify(o));
const copy = o => (o === undefined ? o : clone(o));   // a draft with no bundle must reach checkBundle, not throw here

// A draft ({ program | bundle, updated }) or a version ({ v, at, note, program | bundle }) as a program copy.
export const programOf = x => (isObj(x?.program) ? clone(x.program) : { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: copy(x?.bundle) }] });

const PHASE_ID = /^[\w-]{1,64}$/;
const isDate = s => { const d = new Date(s + 'T00:00:00Z'); return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d) && d.toISOString().slice(0, 10) === s; };   // 2026-02-30 rolls over, so it differs

// → null when the program is fine, else the reason (a checkBundle code for a bad phase bundle).
export function checkProgram(p) {
  if (!isObj(p) || !Array.isArray(p.phases) || !p.phases.length) return 'bad-program';
  let size;
  try { size = Buffer.byteLength(JSON.stringify(p)); } catch { return 'bad-program'; }
  if (size > RX_LIMITS.programBytes) return 'too-big';
  if (p.phases.length > RX_LIMITS.phases) return 'too-many-phases';
  if (p.start !== null && !isDate(p.start)) return 'bad-start';
  const ids = new Set();
  for (const ph of p.phases) {
    if (!isObj(ph) || typeof ph.id !== 'string' || !PHASE_ID.test(ph.id) || ids.has(ph.id) || typeof ph.name !== 'string' || ph.name.length > 40) return 'bad-phase';
    if (!Number.isInteger(ph.weeks) || ph.weeks > RX_LIMITS.weeks || ph.weeks < (p.phases.length === 1 ? 0 : 1)) return 'bad-phase';   // 0 = the lone phase migrated from 2a
    ids.add(ph.id);
  }
  for (const ph of p.phases) { const bad = checkBundle(ph.bundle); if (bad) return bad; }
  return null;
}

// `program` is a program; a bare bundle is still read as one phase (routes that have not moved yet pass that).
export function saveDraft(rx, program, now) {
  const p = isObj(program) && Array.isArray(program.phases) ? clone(program) : programOf({ bundle: program });
  const bad = checkProgram(p);
  if (bad) throw fail(bad);
  return { ...clone(rx), draft: { program: p, updated: now } };
}

export function publishDraft(rx, note, now) {
  const program = programOf(rx.draft);
  const bad = checkProgram(program);
  if (bad) throw fail(bad);
  if (!program.phases.some(ph => ph.bundle.routines.some(r => r.ex.length))) throw fail('empty-draft');
  const next = clone(rx);
  next.draft = { program: clone(program), updated: rx.draft.updated };
  const v = (next.versions.at(-1)?.v || 0) + 1;
  next.versions.push({ v, at: now, note: typeof note === 'string' ? note.trim().slice(0, 200) : '', program });
  next.current = v;
  while (next.versions.length > RX_LIMITS.versions) next.versions.splice(next.versions.findIndex(x => x.v !== next.current), 1);
  return next;
}

export function restoreVersion(rx, v, now) {
  const ver = versionOf(rx, v);
  if (!ver) throw fail('no-such-version');
  return { ...clone(rx), draft: { program: ver.program, updated: now } };
}

// The version with its program, whichever shape is stored.
export const versionOf = (rx, v) => { const x = rx.versions.find(y => y.v === v); return x ? { v: x.v, at: x.at, note: x.note, program: programOf(x) } : null; };
export const currentOf = rx => (rx.current == null ? null : versionOf(rx, rx.current));

// What the routes send: the draft as a program, and only the list of versions (no programs).
export const rxView = rx => ({ _rev: rx._rev, draft: { program: programOf(rx.draft), updated: rx.draft.updated }, current: rx.current, versions: rx.versions.map(({ v, at, note }) => ({ v, at, note })) });
