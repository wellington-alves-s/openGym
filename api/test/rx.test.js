/* The prescription document: a draft plus numbered published versions. Pure, no I/O. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RX_LIMITS, EMPTY_BUNDLE, emptyRx, checkBundle, saveDraft, publishDraft, restoreVersion, versionOf, currentOf, rxView } from '../rx.js';

const routine = (id = 'r1', n = 1) => ({ id, name: 'Push', ex: Array.from({ length: n }, (_, i) => ({ id: 'ex' + i, sets: 3 })) });
const bundle = (over = {}) => ({ ...EMPTY_BUNDLE(), routines: [routine()], week: { 1: ['r1'] }, ...over });
const code = fn => { try { fn(); } catch (e) { return e.code; } return null; };

describe('rx limits and empty values', () => {
  it('exposes the limits and empty shapes verbatim', () => {
    assert.deepEqual(RX_LIMITS, { routines: 30, exercises: 60, bytes: 131072, versions: 50 });
    assert.deepEqual(EMPTY_BUNDLE(), { opengym_plan: 1, unit: 'kg', week: {}, routines: [], customEx: [] });
    assert.deepEqual(emptyRx(), { _rev: 0, draft: { bundle: EMPTY_BUNDLE(), updated: 0 }, versions: [], current: null });
    assert.notEqual(EMPTY_BUNDLE().routines, EMPTY_BUNDLE().routines);
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
    const next = saveDraft(rx, b, 500);
    assert.equal(JSON.stringify(rx), snap);
    assert.deepEqual(next.draft, { bundle: b, updated: 500 });
    next.draft.bundle.routines[0].name = 'changed';
    assert.equal(b.routines[0].name, 'Push');   // not shared with the caller's object
  });

  it('refuses an invalid bundle with its code', () => {
    assert.equal(code(() => saveDraft(emptyRx(), bundle({ unit: 'st' }), 1)), 'bad-bundle');
    assert.equal(code(() => saveDraft(emptyRx(), bundle({ week: { 1: ['zz'] } }), 1)), 'bad-week');
  });
});

describe('publishDraft', () => {
  const publish = (rx, note, now) => publishDraft(saveDraft(rx, bundle({ routines: [routine('r1', 1 + (now % 3))] }), now), note, now);

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
    const rx = saveDraft(emptyRx(), bundle({ routines: [routine('r1', 0)], week: {} }), 1);
    assert.equal(code(() => publishDraft(rx, '', 2)), 'empty-draft');
  });

  it('trims the note and cuts it at 200; the draft stays equal to the published version', () => {
    const rx = publishDraft(saveDraft(emptyRx(), bundle(), 5), '  ' + 'a'.repeat(300) + '  ', 6);
    assert.equal(rx.versions[0].note, 'a'.repeat(200));
    assert.equal(publishDraft(saveDraft(emptyRx(), bundle(), 5), '  hi  ', 6).versions[0].note, 'hi');
    assert.equal(publishDraft(saveDraft(emptyRx(), bundle(), 5), undefined, 6).versions[0].note, '');
    assert.deepEqual(rx.draft.bundle, rx.versions[0].bundle);
    rx.versions[0].bundle.routines[0].name = 'changed';
    assert.equal(rx.draft.bundle.routines[0].name, 'Push');   // the version is its own copy
  });

  it('51 publications leave 50 versions and the oldest goes; current stays', () => {
    let rx = emptyRx();
    for (let i = 1; i <= 51; i++) rx = publish(rx, '', i);
    assert.equal(rx.versions.length, 50);
    assert.equal(rx.versions[0].v, 2);
    assert.equal(rx.current, 51);
    assert.ok(versionOf(rx, rx.current));
  });

  it('does not mutate its argument', () => {
    const rx = saveDraft(emptyRx(), bundle(), 1);
    const snap = JSON.stringify(rx);
    publishDraft(rx, 'x', 2);
    assert.equal(JSON.stringify(rx), snap);
  });
});

describe('restoreVersion, versionOf, currentOf, rxView', () => {
  const two = () => {
    let rx = publishDraft(saveDraft(emptyRx(), bundle({ unit: 'kg' }), 1), 'one', 2);
    rx = publishDraft(saveDraft(rx, bundle({ unit: 'lb' }), 3), 'two', 4);
    return rx;
  };

  it('copies the version into the draft without a new version or a new current', () => {
    const rx = two();
    const snap = JSON.stringify(rx);
    const back = restoreVersion(rx, 1, 99);
    assert.equal(JSON.stringify(rx), snap);
    assert.equal(back.draft.bundle.unit, 'kg');
    assert.equal(back.draft.updated, 99);
    assert.equal(back.versions.length, 2);
    assert.equal(back.current, 2);
    back.draft.bundle.routines[0].name = 'changed';
    assert.equal(versionOf(back, 1).bundle.routines[0].name, 'Push');
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
    assert.deepEqual(view.draft, rx.draft);
    assert.deepEqual(view.versions, [{ v: 1, at: 2, note: 'one' }, { v: 2, at: 4, note: 'two' }]);
    view.draft.bundle.routines[0].name = 'changed';
    assert.equal(rx.draft.bundle.routines[0].name, 'Push');   // a copy, not the document's own
  });
});
