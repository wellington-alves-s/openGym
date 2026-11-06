/* The prescription document: a draft plus numbered published versions. Pure, no I/O. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RX_LIMITS, EMPTY_BUNDLE, EMPTY_PROGRAM, emptyRx, checkBundle, programOf, checkProgram, saveDraft, publishDraft, restoreVersion, versionOf, currentOf, rxView } from '../rx.js';

const routine = (id = 'r1', n = 1) => ({ id, name: 'Push', ex: Array.from({ length: n }, (_, i) => ({ id: 'ex' + i, sets: 3 })) });
const bundle = (over = {}) => ({ ...EMPTY_BUNDLE(), routines: [routine()], week: { 1: ['r1'] }, ...over });
const prog = (...bundles) => ({ start: null, phases: bundles.map((b, i) => ({ id: 'p' + (i + 1), name: 'Phase ' + (i + 1), weeks: 4, bundle: b })) });
const code = fn => { try { fn(); } catch (e) { return e.code; } return null; };

const saveBundle = (rx, b, now) => saveDraft(rx, programOf({ bundle: b }), now);   // saveDraft takes programs only; the routes wrap a 2a bundle

describe('rx limits and empty values', () => {
  it('exposes the limits and empty shapes verbatim', () => {
    assert.deepEqual(RX_LIMITS, { routines: 30, exercises: 60, bytes: 131072, versions: 50, phases: 24, programBytes: 262144, weeks: 52 });
    assert.deepEqual(EMPTY_BUNDLE(), { opengym_plan: 1, unit: 'kg', week: {}, routines: [], customEx: [] });
    assert.deepEqual(emptyRx(), { _rev: 0, draft: { program: EMPTY_PROGRAM(), updated: 0 }, versions: [], current: null });
    assert.notEqual(EMPTY_BUNDLE().routines, EMPTY_BUNDLE().routines);
    assert.deepEqual(EMPTY_PROGRAM(), { start: null, phases: [{ id: 'p1', name: '', weeks: 4, bundle: EMPTY_BUNDLE() }] });
  });
});

describe('checkBundle', () => {
  it('accepts the empty bundle and a valid one', () => {
    assert.equal(checkBundle(EMPTY_BUNDLE()), null);
    assert.equal(checkBundle(bundle()), null);
    assert.equal(checkBundle(bundle({ unit: 'lb', week: { 0: 'r1', 6: ['r1'] } })), null);
  });

  it('refuses a malformed bundle', () => {
    for (const b of [null, undefined, 'x', 3, [], bundle({ unit: 'st' }), bundle({ unit: undefined }), bundle({ customEx: [{ id: 'c' }] }), bundle({ routines: 'x' }), bundle({ customEx: undefined }), bundle({ opengym_plan: undefined }), bundle({ opengym_plan: 2 }), bundle({ opengym_plan: '1' })])
      assert.equal(checkBundle(b), 'bad-bundle', JSON.stringify(b));
    for (const r of [{ name: 'A', ex: [] }, { id: 'r1', ex: [] }, { id: 'r1', name: 'A' }, { id: 'r1', name: 'A', ex: 'x' }, { id: 'r1', name: 7, ex: [] }, { id: 'r 1', name: 'A', ex: [] }, { id: 'x'.repeat(65), name: 'A', ex: [] }, { id: '', name: 'A', ex: [] }, null, 'r1',
      { id: 'r1', name: 'A', ex: [{}] }, { id: 'r1', name: 'A', ex: [{ id: 5 }] }, { id: 'r1', name: 'A', ex: [null] }])
      assert.equal(checkBundle(bundle({ routines: [r], week: {} })), 'bad-bundle', JSON.stringify(r));
    assert.equal(checkBundle(bundle({ routines: [routine('a'), routine('a')], week: {} })), 'bad-bundle');
  });

  it('checks the week against the routines', () => {
    for (const week of [{ 7: ['r1'] }, { x: ['r1'] }, { '-1': ['r1'] }, { 1: ['nope'] }, { 1: [5] }, { 1: 5 }, { 1: null }, [], 'x'])
      assert.equal(checkBundle(bundle({ week })), 'bad-week', JSON.stringify(week));
  });

  it('enforces the counts and the size', () => {
    const many = n => Array.from({ length: n }, (_, i) => routine('r' + i));
    assert.equal(checkBundle(bundle({ routines: many(30), week: {} })), null);
    assert.equal(checkBundle(bundle({ routines: many(31), week: {} })), 'too-many-routines');
    assert.equal(checkBundle(bundle({ routines: [routine('r1', 60)] })), null);
    assert.equal(checkBundle(bundle({ routines: [routine('r1', 61)] })), 'too-many-exercises');
    const fat = routine('r1', 2);
    fat.ex[0].note = 'x'.repeat(RX_LIMITS.bytes);
    assert.equal(checkBundle(bundle({ routines: [fat] })), 'too-big');
  });
});

describe('saveDraft', () => {
  it('replaces the draft, stamps it, and leaves the argument alone', () => {
    const rx = emptyRx();
    const snap = JSON.stringify(rx);
    const b = bundle();
    const next = saveBundle(rx, b, 500);
    assert.equal(JSON.stringify(rx), snap);
    assert.deepEqual(next.draft, { program: programOf({ bundle: b }), updated: 500 });
    next.draft.program.phases[0].bundle.routines[0].name = 'changed';
    assert.equal(b.routines[0].name, 'Push');   // not shared with the caller's object
  });

  it('refuses an invalid bundle with its code', () => {
    assert.equal(code(() => saveBundle(emptyRx(), bundle({ unit: 'st' }), 1)), 'bad-bundle');
    assert.equal(code(() => saveBundle(emptyRx(), bundle({ week: { 1: ['zz'] } }), 1)), 'bad-week');
  });
});

describe('publishDraft', () => {
  const publish = (rx, note, now) => publishDraft(saveBundle(rx, bundle({ routines: [routine('r1', 1 + (now % 3))] }), now), note, now);

  it('numbers 1, 2, 3 and sets current', () => {
    let rx = emptyRx();
    for (const n of [1, 2, 3]) {
      rx = publish(rx, 'n' + n, n * 10);
      assert.equal(rx.current, n);
      assert.equal(rx.versions.at(-1).v, n);
      assert.equal(rx.versions.at(-1).at, n * 10);
    }
    assert.deepEqual(rx.versions.map(v => v.v), [1, 2, 3]);
  });

  it('refuses a draft with no routine that has an exercise', () => {
    assert.equal(code(() => publishDraft(emptyRx(), '', 1)), 'empty-draft');
    const rx = saveBundle(emptyRx(), bundle({ routines: [routine('r1', 0)], week: {} }), 1);
    assert.equal(code(() => publishDraft(rx, '', 2)), 'empty-draft');
  });

  it('trims the note and cuts it at 200; the draft stays equal to the published version', () => {
    const rx = publishDraft(saveBundle(emptyRx(), bundle(), 5), '  ' + 'a'.repeat(300) + '  ', 6);
    assert.equal(rx.versions[0].note, 'a'.repeat(200));
    assert.equal(publishDraft(saveBundle(emptyRx(), bundle(), 5), '  hi  ', 6).versions[0].note, 'hi');
    assert.equal(publishDraft(saveBundle(emptyRx(), bundle(), 5), undefined, 6).versions[0].note, '');
    assert.deepEqual(rx.draft.program, rx.versions[0].program);
    rx.versions[0].program.phases[0].bundle.routines[0].name = 'changed';
    assert.equal(rx.draft.program.phases[0].bundle.routines[0].name, 'Push');   // the version is its own copy
  });

  it('51 publications leave 50 versions and the oldest goes; current stays', () => {
    let rx = emptyRx();
    for (let i = 1; i <= 51; i++) rx = publish(rx, '', i);
    assert.equal(rx.versions.length, 50);
    assert.equal(rx.versions[0].v, 2);
    assert.equal(rx.current, 51);
    assert.ok(versionOf(rx, rx.current));
  });

  it('with 50 stage 2a versions (bundle only) the trim drops the oldest and the rest still read', () => {
    const legacy = Array.from({ length: 50 }, (_, i) => ({ v: i + 1, at: i, note: '', bundle: bundle() }));
    let rx = { _rev: 1, draft: { bundle: bundle(), updated: 1 }, versions: legacy, current: 1 };
    rx = publishDraft(rx, 'new', 99);
    assert.equal(rx.versions.length, 50);
    assert.deepEqual(rx.versions.map(v => v.v).slice(0, 2), [2, 3]);   // the oldest legacy one goes
    assert.equal(rx.current, 51);
    assert.deepEqual(rx.versions.at(-1).program, programOf({ bundle: bundle() }));
    assert.deepEqual(versionOf(rx, 2).program, programOf({ bundle: bundle() }));   // the legacy ones left still read
    assert.equal('program' in rx.versions[0], false);   // and stay as they were stored
  });

  it('does not mutate its argument', () => {
    const rx = saveBundle(emptyRx(), bundle(), 1);
    const snap = JSON.stringify(rx);
    publishDraft(rx, 'x', 2);
    assert.equal(JSON.stringify(rx), snap);
  });
});

describe('restoreVersion, versionOf, currentOf, rxView', () => {
  const two = () => {
    let rx = publishDraft(saveBundle(emptyRx(), bundle({ unit: 'kg' }), 1), 'one', 2);
    rx = publishDraft(saveBundle(rx, bundle({ unit: 'lb' }), 3), 'two', 4);
    return rx;
  };

  it('copies the version into the draft without a new version or a new current', () => {
    const rx = two();
    const snap = JSON.stringify(rx);
    const back = restoreVersion(rx, 1, 99);
    assert.equal(JSON.stringify(rx), snap);
    assert.equal(back.draft.program.phases[0].bundle.unit, 'kg');
    assert.equal(back.draft.updated, 99);
    assert.equal(back.versions.length, 2);
    assert.equal(back.current, 2);
    back.draft.program.phases[0].bundle.routines[0].name = 'changed';
    assert.equal(versionOf(back, 1).program.phases[0].bundle.routines[0].name, 'Push');
  });

  it('an unknown version throws no-such-version', () => {
    assert.equal(code(() => restoreVersion(two(), 9, 1)), 'no-such-version');
    assert.equal(code(() => restoreVersion(emptyRx(), 1, 1)), 'no-such-version');
  });

  it('versionOf and currentOf', () => {
    const rx = two();
    assert.equal(versionOf(rx, 1).note, 'one');
    assert.equal(versionOf(rx, 7), null);
    assert.equal(currentOf(rx).v, 2);
    assert.equal(currentOf(emptyRx()), null);
  });

  it('rxView leaves out the bundles of the versions', () => {
    const rx = { ...two(), _rev: 4 };
    const view = rxView(rx);
    assert.equal(view._rev, 4);
    assert.equal(view.current, 2);
    assert.deepEqual(view.draft.program, rx.draft.program);
    assert.deepEqual(view.versions, [{ v: 1, at: 2, note: 'one' }, { v: 2, at: 4, note: 'two' }]);
    view.draft.program.phases[0].bundle.routines[0].name = 'changed';
    assert.equal(rx.draft.program.phases[0].bundle.routines[0].name, 'Push');   // a copy, not the document's own
  });
});

describe('programOf', () => {
  it('wraps a 2a draft or version as one phase p1 with weeks 0 and no start', () => {
    const b = bundle();
    const want = { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: b }] };
    assert.deepEqual(programOf({ bundle: b, updated: 3 }), want);
    assert.deepEqual(programOf({ v: 1, at: 2, note: '', bundle: b }), want);
    assert.notEqual(programOf({ bundle: b }).phases[0].bundle, b);
  });

  it('returns a copy of a program', () => {
    const p = prog(bundle());
    const out = programOf({ program: p, updated: 1 });
    assert.deepEqual(out, p);
    assert.notEqual(out, p);
    assert.notEqual(out.phases, p.phases);
  });
});

describe('checkProgram', () => {
  const two = () => prog(bundle(), bundle());
  const withPhase = over => { const p = two(); Object.assign(p.phases[0], over); return p; };

  it('accepts the empty program, a 2a-shaped one and a valid one', () => {
    assert.equal(checkProgram(EMPTY_PROGRAM()), null);
    assert.equal(checkProgram(programOf({ bundle: bundle() })), null);
    assert.equal(checkProgram(two()), null);
    assert.equal(checkProgram({ ...two(), start: '2026-02-28' }), null);
    assert.equal(checkProgram(withPhase({ name: '', weeks: 52 })), null);
    assert.equal(checkProgram(withPhase({ name: 'x'.repeat(40), weeks: 1 })), null);
    assert.equal(checkProgram(prog(...Array.from({ length: 24 }, () => EMPTY_BUNDLE()))), null);
  });

  it('refuses what is not a program', () => {
    for (const p of [null, undefined, 'x', 3, [], {}, { start: null }, { start: null, phases: 'x' }, { start: null, phases: [] }])
      assert.equal(checkProgram(p), 'bad-program', JSON.stringify(p));
  });

  it('a cyclic program is bad-program, never a throw', () => {
    const p = prog(bundle());
    p.phases[0].self = p;
    assert.equal(checkProgram(p), 'bad-program');
  });

  it('caps the phases at 24', () => {
    assert.equal(checkProgram(prog(...Array.from({ length: 25 }, () => EMPTY_BUNDLE()))), 'too-many-phases');
  });

  it('checks each phase', () => {
    for (const over of [{ weeks: 0 }, { weeks: 53 }, { weeks: 1.5 }, { weeks: '4' }, { weeks: -1 }, { name: 'x'.repeat(41) }, { name: 5 }, { id: 'p2' }, { id: 'a b' }, { id: '' }, { id: 'x'.repeat(65) }, { id: 7 }])
      assert.equal(checkProgram(withPhase(over)), 'bad-phase', JSON.stringify(over));
    assert.equal(checkProgram({ ...two(), phases: [two().phases[0], null] }), 'bad-phase');
  });

  it('weeks 0 is for a single phase only', () => {
    const solo = programOf({ bundle: bundle() });
    assert.equal(solo.phases[0].weeks, 0);
    assert.equal(checkProgram(solo), null);
    solo.phases.push({ id: 'p2', name: '', weeks: 4, bundle: bundle() });
    assert.equal(checkProgram(solo), 'bad-phase');
  });

  it('start is null or a real calendar date', () => {
    for (const start of ['2026-02-30', 'amanhã', '2026-13-01', '2026-1-1', '', 20260101, undefined, '2026-02-28T00:00'])
      assert.equal(checkProgram({ ...two(), start }), 'bad-start', String(start));
    assert.equal(checkProgram({ ...two(), start: '2028-02-29' }), null);
  });

  it('refuses a program over 262144 bytes', () => {
    const fat = n => { const r = routine('r1', 2); r.ex[0].note = 'x'.repeat(n); return bundle({ routines: [r] }); };
    assert.equal(checkProgram(prog(fat(100000), fat(100000))), null);
    assert.equal(checkProgram(prog(fat(100000), fat(100000), fat(100000))), 'too-big');
  });

  it('passes on the code checkBundle gives for a phase', () => {
    assert.equal(checkProgram(withPhase({ bundle: bundle({ customEx: [{ id: 'c' }] }) })), 'bad-bundle');
    assert.equal(checkProgram(withPhase({ bundle: bundle({ week: { 1: ['zz'] } }) })), 'bad-week');
    assert.equal(checkProgram(withPhase({ bundle: undefined })), 'bad-bundle');
  });
});

describe('the program in the document', () => {
  it('saveDraft stores the program and only the program', () => {
    const p = prog(bundle(), bundle({ unit: 'lb' }));
    const rx = emptyRx();
    const snap = JSON.stringify(rx) + JSON.stringify(p);
    const next = saveDraft(rx, p, 7);
    assert.equal(JSON.stringify(rx) + JSON.stringify(p), snap);
    assert.deepEqual(next.draft, { program: p, updated: 7 });
    assert.equal('bundle' in next.draft, false);
    next.draft.program.phases[0].name = 'changed';
    assert.equal(p.phases[0].name, 'Phase 1');
  });

  it('saveDraft refuses an invalid program with its code', () => {
    assert.equal(code(() => saveDraft(emptyRx(), { ...prog(bundle()), start: '2026-02-30' }, 1)), 'bad-start');
    assert.equal(code(() => saveDraft(emptyRx(), prog(bundle({ unit: 'st' })), 1)), 'bad-bundle');
  });

  it('saveDraft reads a malformed program as bad-program, never as a bundle', () => {
    assert.equal(code(() => saveDraft(emptyRx(), bundle(), 1)), 'bad-program');
    assert.equal(code(() => saveDraft(emptyRx(), 'nope', 1)), 'bad-program');
    assert.equal(code(() => saveDraft(emptyRx(), { start: null, phases: [] }, 1)), 'bad-program');
  });

  it('publishDraft numbers 1, 2 and keeps the program', () => {
    const p = prog(bundle(), bundle({ unit: 'lb' }));
    let rx = publishDraft(saveDraft(emptyRx(), p, 1), 'a', 2);
    rx = publishDraft(rx, 'b', 3);
    assert.deepEqual(rx.versions.map(v => v.v), [1, 2]);
    assert.deepEqual(rx.versions[1], { v: 2, at: 3, note: 'b', program: p });
    assert.equal(rx.current, 2);
  });

  it('publishDraft refuses two empty phases and accepts one exercise in the second', () => {
    const empty = prog(bundle({ routines: [routine('r1', 0)], week: {} }), EMPTY_BUNDLE());
    assert.equal(code(() => publishDraft(saveDraft(emptyRx(), empty, 1), '', 2)), 'empty-draft');
    const late = prog(EMPTY_BUNDLE(), bundle());
    assert.equal(publishDraft(saveDraft(emptyRx(), late, 1), '', 2).current, 1);
  });

  it('restoreVersion of a 2a version (only bundle) puts a one-phase program in the draft', () => {
    const b = bundle();
    const rx = { _rev: 3, draft: { bundle: EMPTY_BUNDLE(), updated: 1 }, versions: [{ v: 1, at: 2, note: 'old', bundle: b }], current: 1 };
    const back = restoreVersion(rx, 1, 9);
    assert.deepEqual(back.draft, { program: { start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle: b }] }, updated: 9 });
    assert.equal('bundle' in back.draft, false);
  });

  it('a whole 2a document goes through publishDraft and comes out in the new format', () => {
    const b = bundle();
    const old = { _rev: 5, draft: { bundle: b, updated: 4 }, versions: [{ v: 1, at: 2, note: 'old', bundle: EMPTY_BUNDLE() }], current: 1 };
    const snap = JSON.stringify(old);
    const rx = publishDraft(old, 'new', 10);
    assert.equal(JSON.stringify(old), snap);
    assert.deepEqual(rx.draft, { program: programOf({ bundle: b }), updated: 4 });
    assert.deepEqual(rx.versions.at(-1), { v: 2, at: 10, note: 'new', program: programOf({ bundle: b }) });
    assert.equal(rx.current, 2);
    assert.deepEqual(versionOf(rx, 1).program, programOf({ bundle: EMPTY_BUNDLE() }));   // the untouched legacy version reads normalized
    assert.equal('bundle' in versionOf(rx, 1), false);
    assert.equal(currentOf(rx).v, 2);
  });

  it('rxView has a program in the draft, the bundle too for one phase (a stage 2a app reads it), and versions without programs', () => {
    const old = { _rev: 1, draft: { bundle: bundle(), updated: 4 }, versions: [{ v: 1, at: 2, note: 'o', bundle: bundle() }], current: 1 };
    for (const rx of [old, publishDraft(saveDraft(emptyRx(), prog(bundle()), 1), 'n', 2)]) {
      const view = rxView(rx);
      assert.deepEqual(view.draft.bundle, bundle());
      assert.deepEqual(view.draft.program.phases[0].bundle, view.draft.bundle);
      assert.equal(view.versions.every(v => !('program' in v) && !('bundle' in v)), true);
    }
    assert.deepEqual(rxView(old).draft.program, programOf({ bundle: bundle() }));
    const many = rxView(publishDraft(saveDraft(emptyRx(), prog(bundle(), bundle()), 1), 'n', 2));
    assert.equal('bundle' in many.draft, false);
    assert.equal(many.draft.program.phases.length, 2);
  });

  it('no function mutates its argument', () => {
    const rx = publishDraft(saveDraft(emptyRx(), prog(bundle(), bundle()), 1), 'x', 2);
    const old = { _rev: 1, draft: { bundle: bundle(), updated: 4 }, versions: [{ v: 1, at: 2, note: '', bundle: bundle() }], current: 1 };
    for (const doc of [rx, old]) {
      const snap = JSON.stringify(doc);
      saveDraft(doc, prog(bundle()), 5); publishDraft(doc, 'n', 6); restoreVersion(doc, 1, 7);
      versionOf(doc, 1); currentOf(doc); rxView(doc);
      assert.equal(JSON.stringify(doc), snap);
    }
  });
});
