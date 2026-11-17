import { describe, expect, it } from 'vitest';
import { MAX_PLAN_AHEAD, MAX_REPEATS } from '../shared/diet.js';
import type { RepeatItem } from '../types.ts';
import { shiftDay } from './dietLog.js';
import { addRepeat, repeatFor, repeatSummary, daysName, dropRepeatSkips, EVERY_DAY, newRid, removeRepeat, repeatPlanItem, repeatsShownOn, sameDays, saveRepeat, skipRepeat, skipsAfterLeaving, toggleWeekday, unskipRepeat, WEEKDAYS, withRepeats } from './repeats.js';

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

describe('the Repeat sheet rules', () => {
  it('names the day sets', () => {
    expect(daysName(EVERY_DAY)).toBe('Every day');
    expect(daysName(WEEKDAYS)).toBe('Weekdays');
    expect(daysName([0, 3, 1])).toBe('Mon, Wed, Sun');
    expect(daysName([6])).toBe('Sat');
  });
  it('ticks and unticks a day, keeping weekday order', () => {
    expect(toggleWeekday([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleWeekday([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleWeekday([], 0)).toEqual([0]);
    expect(sameDays([1, 2], [2, 1])).toBe(true);
    expect(sameDays([1], [1, 2])).toBe(false);
  });
  it('saves a new repeat from the day it was set, with its portion and meal', () => {
    const r = saveRepeat([], { item: { k: 'r', id: 'almonds', x: 2, s: 'snack' }, days: [5, 1, 1], from: '2026-11-17' });
    expect(r.error).toBeNull();
    expect(r.list).toEqual([{ rid: 'rp1', k: 'r', id: 'almonds', x: 2, s: 'snack', days: [1, 5], from: '2026-11-17' }]);
    expect(saveRepeat([], { item: { k: 'r', id: 'a', x: 1 }, days: [1], from: today }).list![0]).not.toHaveProperty('x');
  });
  it('changes the days of a repeat that has its rid, and refuses no days, a full list and a twin', () => {
    const l = [rep('rp1', [1])];
    expect(saveRepeat(l, { rid: 'rp1', item: { k: 'r', id: 'oats' }, days: [2, 3], from: today }).list![0]!.days).toEqual([2, 3]);
    expect(saveRepeat(l, { item: { k: 'r', id: 'x' }, days: [], from: today }).error).toMatch(/at least one day/);
    expect(saveRepeat(l, { item: { k: 'r', id: 'oats' }, days: [1], from: today }).error).toMatch(/already/);
    const full = Array.from({ length: MAX_REPEATS }, (_, i) => rep(`rp${i + 1}`, [1], { id: `f${i}` }));
    expect(saveRepeat(full, { item: { k: 'r', id: 'new' }, days: [1], from: today }).error).toMatch(/12 repeats/);
    expect(newRid(full)).toBe(`rp${MAX_REPEATS + 1}`);
  });
  it('stopping a repeat takes all its days and skips away', () => {
    const l = [rep('rp1', every), rep('rp2', every, { id: 'tea' })];
    const left = removeRepeat(l, 'rp1');
    expect(dropRepeatSkips({ '2026-11-18': ['rp1', 'rp2'], '2026-11-19': ['rp1'] }, left)).toEqual({ '2026-11-18': ['rp2'] });
    expect(repeatsShownOn('2026-11-25', {}, left, undefined, today).map(r => r.rid)).toEqual(['rp2']);
  });
  it('an item taken off its place skips its repeat that day only, and only for the same food in the same meal', () => {
    const l = [rep('rp1', every, { id: 'almonds', s: 'snack' })];
    expect(skipsAfterLeaving(l, undefined, '2026-11-18', { k: 'r', id: 'almonds', s: 'snack' })).toEqual({ '2026-11-18': ['rp1'] });
    expect(skipsAfterLeaving(l, undefined, '2026-11-18', { k: 'r', id: 'almonds', s: 'lunch' })).toBeUndefined();
    expect(skipsAfterLeaving(l, undefined, '2026-11-18', { k: 'r', id: 'tea', s: 'snack' })).toBeUndefined();
    expect(skipsAfterLeaving(l, { '2026-11-18': ['rp1'] }, '2026-11-18', { k: 'r', id: 'almonds', s: 'snack' })).toBeUndefined();
    expect(skipsAfterLeaving([rep('rp1', [1], { id: 'almonds' })], undefined, '2026-11-18', { k: 'r', id: 'almonds' })).toBeUndefined(); // Wednesday, not a repeat day
  });
  it('shows a skipped repeat again', () => {
    expect(unskipRepeat({ '2026-11-18': ['a', 'b'] }, '2026-11-18', 'a')).toEqual({ '2026-11-18': ['b'] });
    expect(unskipRepeat({ '2026-11-18': ['a'] }, '2026-11-18', 'a')).toEqual({});
  });
});

describe('repeatFor and repeatSummary', () => {
  it('finds the repeat by its rid, or by the same food in the same meal', () => {
    const l = [rep('rp1', every, { id: 'almonds', s: 'snack' }), rep('rp2', every, { id: 'tea' })];
    expect(repeatFor(l, { k: 'r', id: 'x', rp: 'rp2' })!.id).toBe('tea');
    expect(repeatFor(l, { k: 'r', id: 'almonds', s: 'snack' })!.rid).toBe('rp1');
    expect(repeatFor(l, { k: 'r', id: 'almonds', s: 'lunch' })).toBeUndefined();
    expect(repeatFor(undefined, { k: 'r', id: 'tea' })).toBeUndefined();
  });
  it('says what the choice means, and asks for a day when there is none', () => {
    expect(repeatSummary(weekdays, 'Snack', 'Mon 16')).toBe('Weekdays in Snack, every week from Mon 16 for the next 52 weeks. Nothing is copied: change or stop it here.');
    expect(repeatSummary([], 'Snack', 'Mon 16')).toBe('Pick at least one day.');
  });
});

describe('review fixes', () => {
  it('repeatFor with a day only matches a repeat that shows on that day', () => {
    const l = [rep('rp1', [1], { id: 'a', s: 'snack' }), rep('rp2', [3], { id: 'a', s: 'snack' })];
    expect(repeatFor(l, { k: 'r', id: 'a', s: 'snack' }, '2026-11-18')!.rid).toBe('rp2'); // a Wednesday
    expect(repeatFor(l, { k: 'r', id: 'a', s: 'snack' }, '2026-11-19')).toBeUndefined();
  });
  it('editing the days of a repeat into a twin of another is refused', () => {
    const l = [rep('rp1', [1], { id: 'a' }), rep('rp2', [2], { id: 'a' })];
    expect(saveRepeat(l, { rid: 'rp2', item: { k: 'r', id: 'a' }, days: [1], from: today }).error).toMatch(/already/);
  });
});
