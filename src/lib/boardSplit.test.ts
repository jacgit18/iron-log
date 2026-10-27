import { describe, it, expect } from 'vitest';
import { applySplits, splitMoveState } from './boardSplit.js';
import { applyWeekPatch } from './programMove.js';
import { normWeek, normSplit } from '../shared/week.js';
import { mergeWeek3 } from '../sync/merge.js';
import type { FlatSlot, SplitCard } from '../types.ts';

const item = (ex: string, w = 20) => ({ ex, ph: 'hyp' as const, w, rx: '3×10' });
const ss = (n: number): FlatSlot => ({ id: 'T-ss', day: 1, sec: 'Supersets', tier: 'T2', type: 'superset', items: Array.from({ length: n }, (_, i) => item('ex' + i, 10 + i)) });
const plain: FlatSlot = { id: 'T-p', day: 1, type: 'single', sec: 'Regular', items: [item('solo')] };
const either: FlatSlot = { id: 'T-e', day: 1, type: 'either', items: [item('e1'), item('e2')] };
const sp = (over: Partial<SplitCard> = {}): SplitCard => ({ id: 'S-1m', from: 'T-ss', rest: 'S-1r', k: 0, day: 3, item: item('ex0', 10), ...over });
const exs = (slots: FlatSlot[]) => slots.flatMap(s => s.items.map(i => i.ex)).sort();

describe('applySplits', () => {
  it('returns the same cards when there is no move', () => {
    const slots = [ss(2), plain];
    expect(applySplits(slots, undefined)).toBe(slots);
    expect(applySplits(slots, [])).toBe(slots);
  });
  it('a two-exercise superset becomes two plain cards: no exercise lost or duplicated', () => {
    const out = applySplits([ss(2), plain], [sp()]);
    expect(exs(out)).toEqual(exs([ss(2), plain]));
    const rest = out.find(s => s.id === 'S-1r')!; const moved = out.find(s => s.id === 'S-1m')!;
    expect(rest).toMatchObject({ type: 'single', sec: 'Regular', day: 1, tier: 'T2' }); expect(rest.items.map(i => i.ex)).toEqual(['ex1']);
    expect(moved).toMatchObject({ type: 'single', sec: 'Regular', day: 3, tier: 'T2' }); expect(moved.items).toEqual([item('ex0', 10)]); // sets, reps and weight kept
    expect(out.some(s => s.id === 'T-ss')).toBe(false);
  });
  it('a three-exercise superset stays a superset of two, in order', () => {
    const out = applySplits([ss(3)], [sp({ k: 1, item: item('ex1', 11) })]);
    expect(out.find(s => s.id === 'S-1r')).toMatchObject({ type: 'superset', sec: 'Supersets' });
    expect(out.find(s => s.id === 'S-1r')!.items.map(i => i.ex)).toEqual(['ex0', 'ex2']);
  });
  it('a second move out of the remainder works, in either order of the list', () => {
    const a = sp(); const b = sp({ id: 'S-2m', from: 'S-1r', rest: 'S-2r', k: 0, item: item('ex1', 11), day: 5 });
    const one = applySplits([ss(3)], [a, b]); const two = applySplits([ss(3)], [b, a]);
    for (const out of [one, two]) {
      expect(exs(out)).toEqual(exs([ss(3)]));
      expect(out.find(s => s.id === 'S-2m')!.day).toBe(5);
      expect(out.find(s => s.id === 'S-2r')!.items.map(i => i.ex)).toEqual(['ex2']);
    }
  });
  it('leaves either/or and plain cards alone, and drops a move whose exercise is no longer at that place', () => {
    const slots = [either, plain, ss(2)];
    expect(applySplits(slots, [sp({ from: 'T-e', k: 0, item: item('e1') }), sp({ from: 'T-p', item: item('solo') }), sp({ item: item('other') })])).toEqual(slots);
  });
  it('does not change its input', () => {
    const slots = [ss(2)]; const copy = structuredClone(slots);
    applySplits(slots, [sp()]); expect(slots).toEqual(copy);
  });
});

describe('splitMoveState', () => {
  const ph = (j: number) => (j === 1 ? ('iso' as const) : null);
  it('the exercise takes its tick, skip and phase; the rest are renumbered under the new id; the old keys are untouched', () => {
    const week = { done: { 'T-ss#0': true as const, 'T-ss#2': true as const }, skipped: { 'T-ss#1': true as const }, ph: { 'T-ss:2': 'hyp' as const } };
    const st = splitMoveState(week, 'T-ss', 3, 1, 'S-m', 'S-r', j => (j === 2 ? 'hyp' : null));
    expect(st.patch.done).toEqual({ 'S-r': true }); // both left exercises ticked: the card is ticked
    expect(st.patch.skipped).toEqual({ 'S-m': true });
    expect(st.patch.ph).toEqual({ 'S-r:1': 'hyp' });
    const w = { done: { ...week.done }, skipped: { ...week.skipped }, ph: { ...week.ph } };
    applyWeekPatch(w, st.patch);
    expect(w.done['T-ss#0']).toBe(true); expect(w.skipped['T-ss#1']).toBe(true); // old keys stay
    applyWeekPatch(w, st.undo);
    expect(w).toEqual(week); // undo deletes exactly what was written
  });
  it('a ticked superset keeps every exercise ticked, and a two-exercise one leaves two ticked plain cards', () => {
    const st = splitMoveState({ done: { 'T-ss': true } }, 'T-ss', 2, 0, 'S-m', 'S-r', ph);
    expect(st.patch.done).toEqual({ 'S-m': true, 'S-r': true }); expect(st.patch.ph).toEqual({ 'S-r:0': 'iso' });
    const three = splitMoveState({ done: { 'T-ss': true } }, 'T-ss', 3, 0, 'S-m', 'S-r', () => null);
    expect(three.patch.done).toEqual({ 'S-m': true, 'S-r': true });
  });
  it('a skipped card keeps all its exercises skipped', () => {
    const st = splitMoveState({ skipped: { 'T-ss': true } }, 'T-ss', 3, 2, 'S-m', 'S-r', () => null);
    expect(st.patch.skipped).toEqual({ 'S-m': true, 'S-r': true });
  });
  it('nothing ticked writes nothing', () => {
    const st = splitMoveState({}, 'T-ss', 2, 0, 'S-m', 'S-r', () => null);
    expect(st.keys).toEqual([]);
  });
});

describe('week.split in storage', () => {
  it('normWeek keeps a valid move and drops damaged ones', () => {
    const good = sp();
    const bad = [sp({ id: 'S-2m', rest: 'S-2r', day: 9 }), sp({ id: 'S-3m', rest: 'S-3r', k: -1 }), sp({ id: '', rest: 'S-4r' }), sp({ id: 'S-5m', rest: 'S-5r', item: { ex: '' } as never }), sp({ id: 'S-1m', rest: 'S-6r' }), sp({ id: '__proto__', rest: 'S-7r' })];
    expect(normWeek({ split: [good, ...bad, 'x', null] }).split).toEqual([good]);
    expect(normWeek({}).split).toBeUndefined();
    expect(normSplit('nope')).toEqual([]);
  });
  it('keeps the exercise\'s sets, reps and weight and drops unknown fields', () => {
    const w = normWeek({ split: [{ ...sp(), junk: 1, item: { ...item('ex0', 12.5), extra: 'x' } }] });
    expect(w.split![0]).toEqual(sp({ item: item('ex0', 12.5) }));
  });
  it('is capped so a damaged file cannot grow the week without limit', () => {
    const many = Array.from({ length: 100 }, (_, i) => sp({ id: `S-${i}m`, rest: `S-${i}r` }));
    expect(normWeek({ split: many }).split).toHaveLength(40);
  });
  it('an older copy that drops the field reads the week as before: the old keys are all still there', () => {
    const before = { done: { 'T-ss#0': true as const }, skipped: {}, ph: { 'T-ss:1': 'iso' as const } };
    const st = splitMoveState(before, 'T-ss', 2, 0, 'S-m', 'S-r', () => null);
    const w = { done: { ...before.done }, skipped: {}, ph: { ...before.ph } } as never;
    applyWeekPatch(w, st.patch);
    const { split: _gone, ...older } = { ...normWeek({ ...(w as object), split: [sp()] }) }; // what a copy without the field keeps
    expect(older.done['T-ss#0']).toBe(true); expect(older.ph['T-ss:1']).toBe('iso');

  });
  it('a stale save merges moves by id: both devices\' moves survive, a removal survives', () => {
    const a = sp(); const b = sp({ id: 'S-2m', rest: 'S-2r', from: 'S-1r', k: 0, item: item('ex1', 11) });
    const base = { split: [a] };
    expect(mergeWeek3(base, { split: [a, b] }, { split: [a] }).week.split).toEqual([a, b]);
    expect(mergeWeek3(base, { split: [a] }, { split: [a, b] }).week.split).toEqual([a, b]);
    expect(mergeWeek3(base, {}, { split: [a] }).week.split).toBeUndefined(); // undone here, untouched there
    expect(mergeWeek3(null, { split: [a] }, { split: [b] }).week).toBeTruthy();
  });
});
