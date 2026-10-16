import { describe, expect, it } from 'vitest';
import { normWeek } from '../shared/week.js';
import { normStretchWeek } from '../shared/stretchWeek.js';
import { BUILTIN } from '../lib/data.js';
import { merge3, mergeGroceryMonth3, mergeStretchWeek3, mergeWeek3 } from './merge.js';

// ADR 031: one test per row of the rules table, plus the fallback without a base.
const week = (over: object) => normWeek({ prog: 'A', ...over });
const sweek = (over: object) => normStretchWeek(over);
const ran = (prog: 'A' | 'B') => ({ prog, program: BUILTIN[prog] });

describe('mergeWeek3', () => {
  it('keeps a tick made on each side', () => {
    const m = mergeWeek3(week({}), week({ done: { a: true } }), week({ done: { b: true } }));
    expect(m.week.done).toEqual({ a: true, b: true });
    expect(m.tookTheirs).toBe(true);
  });

  it('an untick on either side sticks', () => {
    const base = week({ done: { a: true, b: true } });
    expect(mergeWeek3(base, week({ done: { b: true, c: true } }), base).week.done).toEqual({ b: true, c: true }); // unticked here
    expect(mergeWeek3(base, week({ done: { a: true, b: true, c: true } }), week({ done: { b: true } })).week.done).toEqual({ b: true, c: true }); // unticked there
  });

  it('a tick new on the other side beats this device\'s skip of the same superset exercise (skipped["id#i"]), and a tick from the skipping side does not', () => {
    const base = week({});
    const m = mergeWeek3(base, week({ skipped: { 'ss#1': true } }), week({ done: { 'ss#1': true } }));
    expect(m.week.skipped).toEqual({}); expect(m.week.done).toEqual({ 'ss#1': true }); expect(m.unskipped).toBe(true);
    const keep = mergeWeek3(base, week({ done: { 'ss#0': true }, skipped: { 'ss#1': true } }), week({ done: { 'ss#0': true } }));
    expect(keep.week.skipped).toEqual({ 'ss#1': true });
  });

  it('skips and unskips on either side survive', () => {
    const base = week({ skipped: { a: true } });
    expect(mergeWeek3(base, week({ skipped: { a: true, b: true } }), week({})).week.skipped).toEqual({ b: true });
  });

  it('a tick new on the other side beats this device\'s skip, and says so', () => {
    const m = mergeWeek3(week({}), week({ skipped: { x: true, y: true } }), week({ done: { x: true } }));
    expect(m.week.done).toEqual({ x: true });
    expect(m.week.skipped).toEqual({ y: true });
    expect(m.unskipped).toBe(true);
  });

  it('a tick of one set of a card ("id#n") beats a skip of the card', () => {
    const m = mergeWeek3(week({}), week({ skipped: { x: true } }), week({ done: { 'x#0': true } }));
    expect(m.week.skipped).toEqual({});
    expect(m.unskipped).toBe(true);
  });

  it('a skip this device makes after a tick it already had is left alone', () => {
    const base = week({ done: { x: true } });
    const m = mergeWeek3(base, week({ done: { x: true }, skipped: { x: true } }), week({ done: { x: true, y: true } }));
    expect(m.week.skipped).toEqual({ x: true });
    expect(m.unskipped).toBe(false);
  });

  it('ticking half a superset and skipping the rest on this device keeps the skip and the tick', () => {
    // Reported 2026-10-13: the skip was dropped as if the tick came from another device, so the card came back half done.
    const m = mergeWeek3(week({}), week({ done: { 'x#0': true }, skipped: { x: true } }), week({ done: { y: true } }));
    expect(m.week.done).toEqual({ 'x#0': true, y: true });
    expect(m.week.skipped).toEqual({ x: true });
    expect(m.unskipped).toBe(false);
  });

  it('a half ticked on the other device still beats this device\'s skip of the card', () => {
    const m = mergeWeek3(week({}), week({ skipped: { x: true } }), week({ done: { 'x#1': true } }));
    expect(m.week.skipped).toEqual({});
  });

  it('warm-up checks merge per day and item', () => {
    const m = mergeWeek3(week({}), week({ warm: { 1: { a: true } } }), week({ warm: { 1: { b: true }, 2: { c: true } } }));
    expect(m.week.warm).toEqual({ 1: { a: true, b: true }, 2: { c: true } });
  });

  it('moves and phase picks merge per card; one both changed is this device\'s', () => {
    const base = week({ moved: { a: 2 }, ph: { a: 'str' } });
    const m = mergeWeek3(base, week({ moved: { a: 3 }, ph: { a: 'str', b: 'hyp' } }), week({ moved: { a: 4, c: 5 }, ph: {} }));
    expect(m.week.moved).toEqual({ a: 3, c: 5 });
    expect(m.week.ph).toEqual({ b: 'hyp' }); // removed there, added here
  });

  it('extra cards by id: added, removed and edited on either side; one both edited is this device\'s', () => {
    const x = (id: string, note = '') => ({ id, day: 1, ex: 'squat', ph: null, note });
    const base = week({ extra: [x('X-1'), x('X-2'), x('X-3')] });
    const m = mergeWeek3(base, week({ extra: [x('X-1', 'mine'), x('X-3', 'mine'), x('X-4')] }), week({ extra: [x('X-1', 'theirs'), x('X-2'), x('X-3', 'theirs'), x('X-5')] }));
    expect(m.week.extra!.map(e => [e.id, e.note])).toEqual([['X-1', 'mine'], ['X-3', 'mine'], ['X-4', ''], ['X-5', '']]);
  });

  it('day order is one value', () => {
    const base = week({});
    expect(mergeWeek3(base, week({}), week({ order: [2, 1, 3, 4, 5, 6, 7] })).week.order).toEqual([2, 1, 3, 4, 5, 6, 7]);
    expect(mergeWeek3(base, week({ order: [3, 2, 1, 4, 5, 6, 7] }), week({ order: [2, 1, 3, 4, 5, 6, 7] })).week.order).toEqual([3, 2, 1, 4, 5, 6, 7]);
  });

  it('rest days and restOn come from the same side', () => {
    const base = week({ rest: [7], restOn: '2026-09-20' });
    const m = mergeWeek3(base, week({ rest: [6], restOn: '2026-09-20' }), week({ rest: [7], restOn: '2026-09-21' }));
    expect([m.week.rest, m.week.restOn]).toEqual([[6], '2026-09-20']);
    const t = mergeWeek3(base, base, week({ rest: [5], restOn: '2026-09-22' }));
    expect([t.week.rest, t.week.restOn]).toEqual([[5], '2026-09-22']);
  });

  it('prog and ran come from the same side', () => {
    const base = week({ prog: 'A', ran: ran('A') });
    const t = mergeWeek3(base, base, week({ prog: 'B', ran: ran('B') }));
    expect([t.week.prog, t.week.ran?.prog]).toEqual(['B', 'B']);
    const o = mergeWeek3(base, week({ prog: 'B' }), week({ prog: 'A', ran: ran('A'), done: { z: true } }));
    expect([o.week.prog, o.week.ran]).toEqual(['B', undefined]); // this device chose B (dropping the record); theirs kept A
  });

  it('says nothing was taken when the other side changed nothing this device lacks', () => {
    const base = week({ done: { a: true } });
    const m = mergeWeek3(base, week({ done: { a: true, b: true } }), base);
    expect(m.tookTheirs).toBe(false);
  });

  it('without a base, falls back to the two-way import merge (union; this device\'s values win)', () => {
    const m = mergeWeek3(null, week({ done: { a: true }, skipped: { x: true }, moved: { m: 3 } }), week({ done: { x: true, b: true }, moved: { m: 4 } }));
    expect(m.week.done).toEqual({ a: true, b: true, x: true });
    expect(m.week.skipped).toEqual({});
    expect(m.week.moved).toEqual({ m: 3 });
    expect(m.unskipped).toBe(true);
  });

  it('does not change the weeks it was given, and reads weeks that are not clean', () => {
    const ours = week({ skipped: { x: true } });
    mergeWeek3(week({}), ours, week({ done: { x: true } }));
    expect(ours.skipped).toEqual({ x: true });
    expect(mergeWeek3({}, { skipped: { x: 1 } }, { done: { x: 1 } }).week.done).toEqual({ x: true });
  });
});

describe('mergeWeek3 program layout', () => {
  it('takes the shown program and its rest days from one side', () => {
    const base = { prog: null, rest: [3] };
    const switched = { prog: 'B', stash: { A: { rest: [3] } } };
    const ticked = { prog: null, rest: [3, 5] };
    const a = mergeWeek3(base, ticked, switched).week;
    expect([a.prog, a.rest, a.stash]).toEqual([null, [3, 5], undefined]);
    const b = mergeWeek3(base, switched, ticked).week;
    expect([b.prog, b.rest, b.stash]).toEqual(['B', undefined, { A: { rest: [3] } }]);
  });
  it('keeps a stash through normWeek and drops a bad one', () => {
    expect(normWeek({ stash: { A: { rest: [2, 9] }, B: { rest: 'x' }, C: { rest: [1] } } }).stash).toEqual({ A: { rest: [2] } });
  });
});

describe('mergeStretchWeek3', () => {
  it('keeps ticks from both sides and lets an untick stick', () => {
    const base = sweek({ done: { '1:a': true } });
    const m = mergeStretchWeek3(base, sweek({ done: { '2:b': true } }), sweek({ done: { '1:a': true, '3:c': true } }));
    expect(m.week.done).toEqual({ '2:b': true, '3:c': true });
  });

  it('a stretch ticked on the other device un-skips the day this device skipped', () => {
    const m = mergeStretchWeek3(sweek({}), sweek({ skipped: { 1: true } }), sweek({ done: { '1:a': true } }));
    expect(m.week.skipped).toEqual({});
    expect(m.unskipped).toBe(true);
  });

  it('a day this device skipped with its own ticks on it stays skipped', () => {
    const base = sweek({ done: { '1:a': true } });
    const m = mergeStretchWeek3(base, sweek({ done: { '1:a': true }, skipped: { 1: true } }), sweek({ done: { '1:a': true, '2:b': true } }));
    expect(m.week.skipped).toEqual({ 1: true });
  });

  it('extra stretches by id; one both edited is this device\'s', () => {
    const x = (id: string, note?: string) => ({ id, day: 1, n: 'Hip flexor', ...(note ? { note } : {}) });
    const base = sweek({ extra: [x('s1'), x('s2')] });
    const m = mergeStretchWeek3(base, sweek({ extra: [x('s1', 'mine')] }), sweek({ extra: [x('s1', 'theirs'), x('s2'), x('s3')] }));
    expect(m.week.extra.map(e => [e.id, e.note])).toEqual([['s1', 'mine'], ['s3', undefined]]);
  });

  it('without a base, a union', () => {
    const m = mergeStretchWeek3(null, sweek({ done: { '1:a': true } }), sweek({ done: { '2:b': true }, skipped: { 4: true } }));
    expect(m.week).toEqual(sweek({ done: { '1:a': true, '2:b': true }, skipped: { 4: true } }));
  });
});

// ADR 039: a month of the grocery list, line by line.
describe('mergeGroceryMonth3', () => {
  const month = (lines: object, pulled: string[] = []) => ({ lines, pulled });
  it('keeps an item ticked on each device', () => {
    const m = mergeGroceryMonth3(month({}), month({ kale: { got: true } }), month({ rice: { got: true } }));
    expect(m.week).toEqual(month({ kale: { got: true }, rice: { got: true } }));
    expect(m.tookTheirs).toBe(true);
    expect(m.unskipped).toBe(false);
  });
  it('one device ticks, the other fixes the price of the same item: both are kept', () => {
    const m = mergeGroceryMonth3(month({ kale: { qty: 2 } }), month({ kale: { qty: 2, got: true } }), month({ kale: { qty: 2, cents: 300 } }));
    expect(m.week.lines).toEqual({ kale: { qty: 2, got: true, cents: 300 } });
  });
  it('an untick on either side sticks; a field both changed is this device\'s', () => {
    expect(mergeGroceryMonth3(month({ kale: { got: true } }), month({ kale: { got: true } }), month({})).week).toEqual(month({}));
    expect(mergeGroceryMonth3(month({ kale: { got: true } }), month({}), month({ kale: { got: true }, rice: { got: true } })).week).toEqual(month({ rice: { got: true } }));
    expect(mergeGroceryMonth3(month({ kale: { cents: 100 } }), month({ kale: { cents: 200 } }), month({ kale: { cents: 300 } })).week).toEqual(month({ kale: { cents: 200 } }));
  });
  it('takes nothing when the other side changed nothing', () => {
    const m = mergeGroceryMonth3(month({ kale: { got: true } }), month({ kale: { got: true }, rice: { got: true } }), month({ kale: { got: true } }));
    expect(m).toEqual({ week: month({ kale: { got: true }, rice: { got: true } }), tookTheirs: false, unskipped: false });
  });
  it('old pulled ids merge one by one', () => {
    expect(mergeGroceryMonth3(month({}, ['a']), month({}, ['a', 'b']), month({}, [])).week.pulled).toEqual(['b']);
  });
  it('without a base: every line of both, this device\'s fields over the other\'s', () => {
    expect(mergeGroceryMonth3(null, month({ kale: { got: true, cents: 1 } }, ['x']), month({ kale: { cents: 2, qty: 3 }, rice: { got: true } }, ['y'])).week)
      .toEqual(month({ kale: { got: true, cents: 1, qty: 3 }, rice: { got: true } }, ['x', 'y']));
  });
  it('merge3 picks the merge by table', () => {
    expect(merge3('grocery_months', month({}), month({ a: { got: true } }), month({ b: { got: true } })).week).toEqual(month({ a: { got: true }, b: { got: true } }));
    expect(merge3('weeks', week({}), week({ done: { x: true } }), week({ done: { y: true } })).week).toEqual(mergeWeek3(week({}), week({ done: { x: true } }), week({ done: { y: true } })).week);
    expect(merge3('stretch_weeks', sweek({}), sweek({ done: { '0:a': true } }), sweek({})).week).toEqual(sweek({ done: { '0:a': true } }));
  });
});
