import { describe, expect, it } from 'vitest';
import { MAX_PLAN_AHEAD, MAX_REPEATS } from '../shared/diet.js';
import type { RepeatItem } from '../types.ts';
import { shiftDay } from './dietLog.js';
import { addRepeat, dropRepeatSkips, removeRepeat, repeatPlanItem, repeatsShownOn, skipRepeat, withRepeats } from './repeats.js';

const today = '2026-11-16'; // a Monday
const rep = (rid: string, days: number[], extra: Partial<RepeatItem> = {}): RepeatItem => ({ rid, k: 'r', id: 'oats', days, from: today, ...extra });
const every = [0, 1, 2, 3, 4, 5, 6], weekdays = [1, 2, 3, 4, 5];
const ids = (l: RepeatItem[]) => l.map(r => r.rid);

describe('repeatsShownOn', () => {
  it('shows on matching weekdays only', () => {
    const l = [rep('a', weekdays), rep('b', [0, 6])];
    expect(ids(repeatsShownOn('2026-11-17', {}, l, undefined, today))).toEqual(['a']); // Tuesday
    expect(ids(repeatsShownOn('2026-11-21', {}, l, undefined, today))).toEqual(['b']); // Saturday
  });
  it('shows on every week of the window without copying anything', () => {
    const l = [rep('a', [3])], plan = {};
    for (const wk of [1, 10, 52]) expect(ids(repeatsShownOn(shiftDay(today, 7 * wk - 5), plan, l, undefined, today))).toEqual(['a']); // the Wednesday of weeks 1, 10 and 52 ahead
    expect(plan).toEqual({});
  });
  it('never shows beyond the window or on a past day', () => {
    const l = [rep('a', every)];
    expect(repeatsShownOn(shiftDay(today, MAX_PLAN_AHEAD), {}, l, undefined, today)).toHaveLength(1);
    expect(repeatsShownOn(shiftDay(today, MAX_PLAN_AHEAD + 1), {}, l, undefined, today)).toEqual([]);
    expect(repeatsShownOn(shiftDay(today, -1), {}, [rep('a', every, { from: '2026-01-01' })], undefined, today)).toEqual([]);
  });
  it('does not show before the repeat\'s start day (no back-fill)', () => {
    const l = [rep('a', every, { from: '2026-11-20' })];
    expect(repeatsShownOn('2026-11-19', {}, l, undefined, today)).toEqual([]);
    expect(repeatsShownOn('2026-11-20', {}, l, undefined, today)).toHaveLength(1);
  });
  it('a skip hides that day only', () => {
    const l = [rep('a', every), rep('b', every, { id: 'tea' })], skips = { '2026-11-18': ['a'] };
    expect(ids(repeatsShownOn('2026-11-18', {}, l, skips, today))).toEqual(['b']);
    expect(ids(repeatsShownOn('2026-11-19', {}, l, skips, today))).toEqual(['a', 'b']);
  });
  it('the stored copy of the same food in the same meal wins; another meal does not block', () => {
    const l = [rep('a', every, { s: 'breakfast' })], day = '2026-11-18';
    expect(repeatsShownOn(day, { [day]: [{ k: 'r', id: 'oats', s: 'breakfast' }] }, l, undefined, today)).toEqual([]);
    expect(repeatsShownOn(day, { [day]: [{ k: 'r', id: 'oats', s: 'dinner' }] }, l, undefined, today)).toHaveLength(1);
    expect(repeatsShownOn(day, { [day]: [{ k: 'r', id: 'oats' }] }, l, undefined, today)).toHaveLength(1); // untagged is a meal of its own
  });
  it('nothing for no repeats', () => { expect(repeatsShownOn(today, {}, undefined, undefined, today)).toEqual([]); expect(repeatsShownOn(today, {}, [], undefined, today)).toEqual([]); });
});

describe('repeatPlanItem and withRepeats', () => {
  it('marks the item virtual and names its repeat, with portion and meal when set', () => {
    expect(repeatPlanItem(rep('a', every))).toEqual({ k: 'r', id: 'oats', v: true, rp: 'a' });
    expect(repeatPlanItem(rep('a', every, { x: 2, s: 'snack' }))).toEqual({ k: 'r', id: 'oats', x: 2, s: 'snack', v: true, rp: 'a' });
  });
  it('adds shown repeats after the stored items, leaves the plan alone, and returns the same object when nothing is added', () => {
    const day = '2026-11-17', plan = { [day]: [{ k: 'r' as const, id: 'rice' }] };
    const out = withRepeats(plan, [rep('a', every)], undefined, [day, '2026-11-18'], today);
    expect(out[day]).toEqual([{ k: 'r', id: 'rice' }, repeatPlanItem(rep('a', every))]);
    expect(out['2026-11-18']).toHaveLength(1);
    expect(plan[day]).toHaveLength(1);
    expect(withRepeats(plan, [rep('a', [0])], undefined, [day], today)).toBe(plan);
    expect(withRepeats(plan, undefined, undefined, [day], today)).toBe(plan);
  });
});

describe('list edits', () => {
  it('adds, refuses a repeat of the same repeat and a full list', () => {
    const one = addRepeat([], rep('a', weekdays));
    expect(one.list).toHaveLength(1);
    expect(addRepeat(one.list!, rep('a', [0])).error).toBeTruthy();
    expect(addRepeat(one.list!, rep('b', weekdays)).error).toMatch(/already/);
    expect(addRepeat(one.list!, rep('b', weekdays, { s: 'lunch' })).error).toBeNull();
    const full = Array.from({ length: MAX_REPEATS }, (_, i) => rep(`r${i}`, [i % 7], { id: `f${i}` }));
    expect(addRepeat(full, rep('x', [1], { id: 'zzz' })).error).toMatch(/12/);
  });
  it('removing a repeat takes its skips with it (dropRepeatSkips)', () => {
    const list = removeRepeat([rep('a', every), rep('b', every)], 'a');
    expect(ids(list)).toEqual(['b']);
    expect(dropRepeatSkips({ '2026-11-18': ['a', 'b'], '2026-11-19': ['a'] }, list)).toEqual({ '2026-11-18': ['b'] });
  });
  it('skipRepeat records one day only, once', () => {
    const s = skipRepeat(undefined, '2026-11-18', 'a');
    expect(s).toEqual({ '2026-11-18': ['a'] });
    expect(skipRepeat(s, '2026-11-18', 'a')).toEqual(s);
    expect(skipRepeat(s, '2026-11-19', 'a')).toEqual({ '2026-11-18': ['a'], '2026-11-19': ['a'] });
  });
});
