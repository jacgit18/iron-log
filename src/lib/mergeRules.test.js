// The merge rules in the backend spec (DevHiveMind/Projects/iron-log/docs/backend-data-rules.md, section 4), one test per claim.
import { describe, it, expect } from 'vitest';
import { mergeEntries, mergeWeek, entryId, findEntry } from './export.js';
import { normWeek } from './logic.js';

const real = (o = {}) => ({ id: 'r1', d: '2026-10-05', ph: 'hyp', w: 100, s: 3, r: 8, slot: 'A-d1s1', wk: '2026-10-05', ...o });
const auto = (o = {}) => ({ id: 'a1', d: '2026-10-05', ph: 'hyp', w: 100, s: 3, r: 8, slot: 'A-d1s1', wk: '2026-10-05', auto: true, ...o });

describe('mergeEntries', () => {
  it('adds an entry whose id and content are both new', () => {
    expect(mergeEntries([real()], [real({ id: 'r2', w: 105, slot: 'A-d1s2' })]).map(e => e.id)).toEqual(['r1', 'r2']);
  });
  it('skips an incoming entry whose id exists, even if its content differs (local wins)', () => {
    expect(mergeEntries([real()], [real({ w: 999 })])).toEqual([real()]);
  });
  it('same id: the incoming copy replaces this one only when both have an updatedAt and it is later', () => {
    const old = real({ updatedAt: '2026-10-05T10:00:00.000Z' });
    const later = real({ w: 120, updatedAt: '2026-10-05T11:00:00.000Z' });
    expect(mergeEntries([old], [later])).toEqual([later]);                       // edited later elsewhere: it wins
    expect(mergeEntries([later], [old])).toEqual([later]);                       // older copy: this device wins
    expect(mergeEntries([old], [{ ...later, updatedAt: old.updatedAt }])).toEqual([old]); // same time: this device wins
    expect(mergeEntries([real()], [later])).toEqual([real()]);                   // this one has no timestamp: stays
    expect(mergeEntries([old], [real({ w: 120 })])).toEqual([old]);              // incoming has none: stays
  });
  it('skips an incoming entry whose content matches, even under another id', () => {
    expect(mergeEntries([real()], [real({ id: 'other' })])).toEqual([real()]);
  });
  it('does not add an incoming check-off next to anything for that card and week', () => {
    expect(mergeEntries([real()], [auto()])).toEqual([real()]);
    expect(mergeEntries([auto({ id: 'a1' })], [auto({ id: 'a2', w: 50 })]).map(e => e.id)).toEqual(['a1']);
  });
  it('lets an incoming session replace a local check-off for that card and week', () => {
    expect(mergeEntries([auto()], [real()])).toEqual([real()]);
  });
  it('keeps two different sessions logged by hand for the same card and week', () => {
    expect(mergeEntries([real()], [real({ id: 'r2', w: 110 })])).toHaveLength(2);
  });
  it('only a check-off for that card and week is replaced, never other entries', () => {
    const other = auto({ id: 'a9', slot: 'A-d2s1', d: '2026-10-06' });
    const out = mergeEntries([auto(), other], [real()]);
    expect(out.map(e => e.id).sort()).toEqual(['a9', 'r1']);
  });
  it('dedupes within the incoming list itself', () => {
    expect(mergeEntries([], [real(), real(), real({ id: 'x' })])).toHaveLength(1);
  });
  it('sorts by date and does not mutate its inputs', () => {
    const a = [real({ d: '2026-10-07', id: 'late' })]; const b = [real({ d: '2026-10-01', id: 'early', w: 50, slot: 'A-d9s9' })];
    const before = JSON.stringify([a, b]);
    expect(mergeEntries(a, b).map(e => e.id)).toEqual(['early', 'late']);
    expect(JSON.stringify([a, b])).toBe(before);
  });
  it('an entry with no slot or week is never treated as a check-off clash', () => {
    const bare = { d: '2026-10-05', w: 100, r: 5 };
    expect(mergeEntries([auto()], [bare])).toHaveLength(2);
  });
  it('a legacy entry (no id) and its edited copy keep one identity', () => {
    const legacy = { d: '2026-10-05', w: 100, r: 8, s: 3 };
    const edited = { ...legacy, w: 105, id: entryId(legacy) };
    expect(mergeEntries([edited], [legacy])).toEqual([edited]);
  });
  it('findEntry finds by id, or by content for an entry that has none, and misses when it changed', () => {
    const L = [real(), { d: '2026-10-06', w: 5, r: 5 }];
    expect(findEntry(L, real())).toBe(0);
    expect(findEntry(L, { d: '2026-10-06', w: 5, r: 5 })).toBe(1);
    expect(findEntry(L, real({ id: 'gone' }))).toBe(-1);
    expect(findEntry(L, { d: '2026-10-06', w: 6, r: 5 })).toBe(-1);
  });
});

describe('mergeWeek', () => {
  it('fills prog, rest and order only when this device has none', () => {
    expect(mergeWeek({ prog: 'A' }, { prog: 'B' }).prog).toBe('A');
    expect(mergeWeek({}, { prog: 'B' }).prog).toBe('B');
    expect(mergeWeek({}, { rest: [3] }).rest).toEqual([3]);
    expect(mergeWeek({ rest: [2] }, { rest: [3] }).rest).toEqual([2]);
  });
  it('merges moved, ph and warm with this device winning per key', () => {
    const m = mergeWeek({ moved: { a: 2 }, ph: { a: 'hyp' }, warm: { 1: { w: true } } }, { moved: { a: 5, b: 3 }, ph: { a: 'strength', b: 'iso' }, warm: { 1: { w: false, x: true }, 2: { y: true } } });
    expect(m.moved).toEqual({ a: 2, b: 3 });
    expect(m.ph).toEqual({ a: 'hyp', b: 'iso' });
    expect(m.warm).toEqual({ 1: { w: true, x: true }, 2: { y: true } });
  });
  it('unions extra cards by id, keeping this device’s copy', () => {
    const x = (id, note) => ({ id, day: 1, ex: 'bench', note });
    expect(mergeWeek({ extra: [x('X-1', 'mine')] }, { extra: [x('X-1', 'theirs'), x('X-2', '')] }).extra.map(e => [e.id, e.note])).toEqual([['X-1', 'mine'], ['X-2', '']]);
  });
  it('unions done and skipped, and a done card is never also skipped', () => {
    const m = mergeWeek({ done: { a: true }, skipped: { b: true } }, { done: { c: true }, skipped: { d: true } });
    expect(m.done).toEqual({ a: true, c: true }); expect(m.skipped).toEqual({ b: true, d: true });
  });
  it('a card done on the other side wins over this device’s skip', () => {
    const m = mergeWeek({ skipped: { a: true } }, { done: { a: true } });
    expect(m.done).toEqual({ a: true }); expect(m.skipped).toEqual({});
  });
  it('cannot represent a deletion: what this device removed comes back from the other side', () => {
    expect(mergeWeek({ done: {} }, { done: { a: true } }).done).toEqual({ a: true });
    expect(mergeEntries([], [real()])).toEqual([real()]);
  });
  it('does not change its inputs and returns a normalized week', () => {
    const a = { done: { a: true } }; const b = { done: { b: true } }; const before = JSON.stringify([a, b]);
    expect(mergeWeek(a, b)).toEqual(normWeek({ done: { a: true, b: true } }));
    expect(JSON.stringify([a, b])).toBe(before);
  });
});
