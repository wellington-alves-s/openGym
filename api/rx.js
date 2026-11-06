/* The prescription document a trainer keeps for one student: a draft plus numbered published versions.
 *
 *   { _rev, draft: { bundle, updated }, versions: [ { v, at, note, bundle } ], current: v | null }
 *
 * `bundle` is a plan bundle ({ opengym_plan, unit, week, routines, customEx }). Pure and structural only:
 * the API cannot import the frontend, so what is inside each exercise passes as it came and the app that
 * applies it cleans it (parsePlan). Every function returns a new document and never mutates its argument.
 * Errors carry a `.code`. No I/O here; the file lives in trainer-store.js. */

export const RX_LIMITS = { routines: 30, exercises: 60, bytes: 131072, versions: 50 };

export const EMPTY_BUNDLE = () => ({ opengym_plan: 1, unit: 'kg', week: {}, routines: [], customEx: [] });
export const emptyRx = () => ({ _rev: 0, draft: { bundle: EMPTY_BUNDLE(), updated: 0 }, versions: [], current: null });

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

export function saveDraft(rx, bundle, now) {
  const bad = checkBundle(bundle);
  if (bad) throw fail(bad);
  return { ...clone(rx), draft: { bundle: clone(bundle), updated: now } };
}

export function publishDraft(rx, note, now) {
  const bundle = rx.draft?.bundle;
  const bad = checkBundle(bundle);
  if (bad) throw fail(bad);
  if (!bundle.routines.some(r => r.ex.length)) throw fail('empty-draft');
  const next = clone(rx);
  const v = (next.versions.at(-1)?.v || 0) + 1;
  next.versions.push({ v, at: now, note: typeof note === 'string' ? note.trim().slice(0, 200) : '', bundle: clone(bundle) });
  next.current = v;
  while (next.versions.length > RX_LIMITS.versions) next.versions.splice(next.versions.findIndex(x => x.v !== next.current), 1);
  return next;
}

export function restoreVersion(rx, v, now) {
  const ver = versionOf(rx, v);
  if (!ver) throw fail('no-such-version');
  return { ...clone(rx), draft: { bundle: clone(ver.bundle), updated: now } };
}

export const versionOf = (rx, v) => rx.versions.find(x => x.v === v) || null;
export const currentOf = rx => (rx.current == null ? null : versionOf(rx, rx.current));

// What the routes send: no version bundles, only the list of versions.
export const rxView = rx => ({ _rev: rx._rev, draft: clone(rx.draft), current: rx.current, versions: rx.versions.map(({ v, at, note }) => ({ v, at, note })) });
