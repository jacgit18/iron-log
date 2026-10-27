import { describe, it, expect } from 'vitest';
import { applySplits, joinMoveState } from './boardSplit.js';
import { applyWeekPatch, splitWeekState } from './programMove.js';
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

describe('splitWeekState on the Board (its own rest id, phases shown)', () => {
  const ph = (j: number) => (j === 1 ? ('iso' as const) : null);
  const live = <T,>(m: Record<string, T | null>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v));
  const move = (week: object, count: number, k: number, phase: (j: number) => 'iso' | 'hyp' | null = () => null) => splitWeekState(week, 'T-ss', count, k, 'S-m', { restId: 'S-r', phase });
  it('the exercise takes its tick, skip and phase; the rest are renumbered under the new id; the old keys are untouched', () => {
    const week = { done: { 'T-ss#0': true as const, 'T-ss#2': true as const }, skipped: { 'T-ss#1': true as const }, ph: { 'T-ss:2': 'hyp' as const } };
    const st = move(week, 3, 1, j => (j === 2 ? 'hyp' : null));
    expect(live(st.patch.done)).toEqual({ 'S-r': true }); // both left exercises ticked: the card is ticked
    expect(live(st.patch.skipped)).toEqual({ 'S-m': true });
    expect(live(st.patch.ph)).toEqual({ 'S-r:1': 'hyp' });
    expect(Object.keys({ ...st.patch.done, ...st.patch.skipped, ...st.patch.ph }).some(key => key.startsWith('T-ss'))).toBe(false); // nothing written under the old id
    const w = { done: { ...week.done }, skipped: { ...week.skipped }, ph: { ...week.ph } };
    applyWeekPatch(w, st.patch);
    expect(w.done['T-ss#0']).toBe(true); expect(w.skipped['T-ss#1']).toBe(true); // old keys stay
    applyWeekPatch(w, st.undo);
    expect(w).toEqual(week); // undo deletes exactly what was written
  });
  it('a ticked superset keeps every exercise ticked, and a two-exercise one leaves two ticked plain cards', () => {
    const st = move({ done: { 'T-ss': true } }, 2, 0, ph);
    expect(live(st.patch.done)).toEqual({ 'S-m': true, 'S-r': true }); expect(live(st.patch.ph)).toEqual({ 'S-r:0': 'iso' });
    const three = move({ done: { 'T-ss': true } }, 3, 0);
    expect(live(three.patch.done)).toEqual({ 'S-m': true, 'S-r': true });
  });
  it('a skipped card keeps all its exercises skipped', () => {
    const st = move({ skipped: { 'T-ss': true } }, 3, 2);
    expect(live(st.patch.skipped)).toEqual({ 'S-m': true, 'S-r': true });
  });
  it('nothing ticked writes nothing', () => {
    const st = move({}, 2, 0);
    expect(st.changed).toBe(false);
  });
});

describe('joinMoveState (putting a move back)', () => {
  const e = sp({ k: 1 });
  const join = (week: object, count: number) => { const w = { done: {}, skipped: {}, ph: {}, ...week } as Parameters<typeof applyWeekPatch>[0]; applyWeekPatch(w, joinMoveState(w, e, count)); return w; };
  it('what was ticked or skipped on the new cards goes back onto the card, and the new keys are deleted', () => {
    const w = join({ done: { 'S-1m': true, 'S-1r#0': true }, skipped: { 'S-1r#1': true }, ph: { 'S-1m:0': 'hyp', 'S-1r:0': 'hyp' } }, 3);
    expect(w.done).toEqual({ 'T-ss#0': true, 'T-ss#1': true }); expect(w.skipped).toEqual({ 'T-ss#2': true }); expect(w.ph).toEqual({});
  });
  it('every exercise ticked comes back as a ticked card', () => {
    expect(join({ done: { 'S-1m': true, 'S-1r': true } }, 3).done).toEqual({ 'T-ss': true });
  });
  it('a two-exercise superset: the plain rest card is the other exercise', () => {
    const w = join({ done: { 'S-1r': true } }, 2);
    expect(w.done).toEqual({ 'T-ss#0': true }); // k is 1, so the rest card holds exercise 0
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
    const many = Array.from({ length: 100 }, (_, i) => sp({ id: `S-${i}m`, rest: `S-${i}r`, from: `T-${i}` }));
    expect(normWeek({ split: many }).split).toHaveLength(40);
  });
  it('an older copy that drops the field reads the week as before: the move writes nothing under the old id', () => {
    const before = { done: { 'T-ss#0': true as const }, skipped: {}, ph: { 'T-ss:1': 'iso' as const } };
    const st = splitWeekState(before, 'T-ss', 2, 0, 'S-m', { restId: 'S-r', phase: () => null });
    const w: Parameters<typeof applyWeekPatch>[0] = { done: { ...before.done }, skipped: {}, ph: { ...before.ph } };
    applyWeekPatch(w, st.patch);
    expect(Object.keys({ ...st.patch.done, ...st.patch.skipped, ...st.patch.ph }).some(key => key.startsWith('T-ss'))).toBe(false);
    const { done, ph } = w; expect({ done: { 'T-ss#0': done['T-ss#0'] }, skipped: {}, ph: { 'T-ss:1': ph['T-ss:1'] } }).toEqual(before); // the old keys as they were
    // the known cost: a tick made on the new card after the move lives only under the new id, which a copy without the field never reads
    w.done['S-m'] = true;
    expect(w.done['T-ss#0']).toBe(true); expect(w.done['T-ss#1']).toBeUndefined();
  });
  it('one move per card: when two devices each moved a different exercise out of the same card, the first wins', () => {
    const a = sp(); const b = sp({ id: 'S-2m', rest: 'S-2r', k: 1, item: item('ex1', 11) });
    expect(normSplit([a, b])).toEqual([a]);
    expect(mergeWeek3({}, { split: [a] }, { split: [b] }).week.split).toEqual([a]);
  });
  it('ids that could collide are dropped: a program card id, an experiment card id, a moved exercise used as a card', () => {
    const a = sp();
    const clash = [sp({ id: 'A-d1s1', rest: 'S-9r', from: 'T-x' }), sp({ id: 'S-8m', rest: 'X-abc', from: 'T-y' }), sp({ id: 'S-7m', rest: 'S-7r', from: 'S-1m' }), sp({ id: 'S-6m', rest: 'S-6r', from: 'S-6m' })];
    expect(normSplit([a, ...clash])).toEqual([a]);
    const chain = sp({ id: 'S-2m', rest: 'S-2r', from: 'S-1r', k: 0, item: item('ex1', 11) });
    expect(normSplit([a, chain])).toEqual([a, chain]); // a later move from the card an earlier one left behind is fine
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
