import { describe, expect, it } from 'vitest';
import { MAX_HANDY, MAX_PLAN_AHEAD, MAX_REPEATS } from '../shared/diet.js';
import type { Recipe, RepeatItem } from '../types.ts';
import { shiftDay } from './dietLog.js';
import { boardDay } from './weekBoard.js';
import { addRepeat, handyOn, handyTrays, handyMealFor, skipsAfterRemovingHandy, trayMealOf, repeatFor, repeatSummary, daysName, dropRepeatSkips, EVERY_DAY, newRid, removeRepeat, removeRepeatsFor, repeatPlanItem, retargetRepeats, repeatsShownOn, pruneHandy, sameDays, saveRepeat, skipRepeat, skipsAfterLeaving, toggleWeekday, unskipRepeat, WEEKDAYS, withRepeats } from './repeats.js';

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
    const l = [rep('rp1', every, { id: 'almonds', s: 'snack', from: '2026-11-18' })];
    expect(skipsAfterLeaving(l, undefined, '2026-11-18', { k: 'r', id: 'almonds', s: 'snack' })).toEqual({ '2026-11-18': ['rp1'] });
    expect(skipsAfterLeaving(l, undefined, '2026-11-25', { k: 'r', id: 'almonds', s: 'snack' })).toBeUndefined(); // a hand-added item on a later day is the person's own: removing it shows the repeat again
    expect(skipsAfterLeaving(l, undefined, '2026-11-18', { k: 'r', id: 'almonds', s: 'lunch' })).toBeUndefined();
    expect(skipsAfterLeaving(l, undefined, '2026-11-18', { k: 'r', id: 'tea', s: 'snack' })).toBeUndefined();
    expect(skipsAfterLeaving(l, { '2026-11-18': ['rp1'] }, '2026-11-18', { k: 'r', id: 'almonds', s: 'snack' })).toBeUndefined();
    expect(skipsAfterLeaving([rep('rp1', [1], { id: 'almonds', from: '2026-11-18' })], undefined, '2026-11-18', { k: 'r', id: 'almonds' })).toBeUndefined(); // Wednesday, not a repeat day
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
  it('a repeat that overlaps another of the same food and meal on any day is refused, new or edited', () => {
    const l = [rep('rp1', [1, 2, 3], { id: 'a' })];
    expect(saveRepeat(l, { item: { k: 'r', id: 'a' }, days: [3, 4], from: today }).error).toMatch(/already/);
    expect(saveRepeat(l, { item: { k: 'r', id: 'a' }, days: [4, 5], from: today }).error).toBeNull();
    expect(saveRepeat(l, { item: { k: 'r', id: 'a', s: 'lunch' }, days: [1], from: today }).error).toBeNull(); // another meal is its own repeat
    const two = [rep('rp1', [1], { id: 'a' }), rep('rp2', [2], { id: 'a' })];
    expect(saveRepeat(two, { rid: 'rp2', item: { k: 'r', id: 'a' }, days: [1, 2], from: today }).error).toMatch(/already/);
  });
  it('two stored repeats that overlap (older data) show once', () => {
    const l = [rep('rp1', every, { id: 'a' }), rep('rp2', every, { id: 'a' }), rep('rp3', every, { id: 'b' })];
    expect(repeatsShownOn('2026-11-18', {}, l, undefined, today).map(r => r.rid)).toEqual(['rp1', 'rp3']);
  });
  it('removeRepeatsFor takes every repeat of a deleted food', () => {
    expect(removeRepeatsFor([rep('rp1', every, { id: 'a' }), rep('rp2', every, { id: 'b' }), rep('rp3', [1], { id: 'a', s: 'lunch' })], 'a').map(r => r.rid)).toEqual(['rp2']);
  });
});

describe('retargetRepeats', () => {
  it('moves the repeats of the food that name a meal, and leaves other foods and repeats with no meal', () => {
    const list = [rep('a', [1, 2], { s: 'snack' }), rep('b', [4, 5], { s: 'dinner' }), rep('c', every, { id: 'rice', s: 'snack' }), rep('d', every)];
    const out = retargetRepeats(list, 'oats', 'breakfast');
    expect(out.map(r => [r.rid, r.s])).toEqual([['a', 'breakfast'], ['b', 'breakfast'], ['c', 'snack'], ['d', undefined]]);
  });
  it('moves only one of two repeats that would overlap once both sit in the meal', () => {
    const list = [rep('a', every, { s: 'snack' }), rep('b', weekdays, { s: 'dinner' })];
    expect(retargetRepeats(list, 'oats', 'breakfast').map(r => r.s)).toEqual(['breakfast', 'dinner']);
  });
  it('leaves a repeat alone when the move would clash with another repeat of the same food and meal on a shared weekday', () => {
    const list = [rep('a', weekdays, { s: 'snack' }), rep('b', [1, 2], { s: 'breakfast' })];
    expect(retargetRepeats(list, 'oats', 'breakfast').map(r => r.s)).toEqual(['snack', 'breakfast']);
  });
  it('moves a repeat when the other repeat of that meal shares no weekday', () => {
    const list = [rep('a', [1, 2], { s: 'snack' }), rep('b', [4, 5], { s: 'breakfast' })];
    expect(retargetRepeats(list, 'oats', 'breakfast').map(r => r.s)).toEqual(['breakfast', 'breakfast']);
  });
  it('returns the same array when nothing changed', () => {
    const list = [rep('a', every, { s: 'breakfast' }), rep('b', every, { id: 'rice', s: 'snack' })];
    expect(retargetRepeats(list, 'oats', 'breakfast')).toBe(list);
  });
});

describe('Keep handy (brief nutrition-keep-handy)', () => {
  const rc = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'protein', ing: [{ n: 'x' }], steps: [], kcal: 300, p: 20, ...extra });
  const recipes = [rc('oats', 'Oats', { meal: 'breakfast' }), rc('beef', 'Beef'), rc('tea', 'Tea', { uses: ['drink'] }), rc('abc', 'Apple', { meal: 'lunch' })];
  const h = (rid: string, extra: Partial<RepeatItem> = {}) => rep(rid, every, { h: true, ...extra });
  const day = '2026-11-18';
  it('splits the shown repeats into the card and the tray', () => {
    const l = [rep('a', every, { id: 'beef' }), h('b')];
    expect(ids(repeatsShownOn(day, {}, l, undefined, today))).toEqual(['a']);
    expect(ids(handyOn(day, {}, l, undefined, today))).toEqual(['b']);
  });
  it('a handy item adds nothing to the plan or the day', () => {
    const l = [h('b')], plan = {};
    expect(withRepeats(plan, l, undefined, [day], today)).toBe(plan);
  });
  it('a day with only handy items counts 0 and shows no plate hint', () => {
    const rs = [rc('oats', 'Oats', { meal: 'breakfast' })], l = [h('b', { s: 'breakfast' })];
    const d = boardDay(withRepeats({}, l, undefined, [day], today), day, rs, [], 2000);
    expect(d).toMatchObject({ count: 0, kcal: 0, protein: 0 });
    expect(d.slots.every(s => s.items.length === 0 && s.need.length === 0 && s.fixes.length === 0)).toBe(true);
  });
  it('the tray follows the repeat window, the start day, the skip and the stored copy', () => {
    const l = [h('b', { s: 'breakfast' })];
    expect(handyOn(shiftDay(today, MAX_PLAN_AHEAD + 1), {}, l, undefined, today)).toEqual([]);
    expect(handyOn(shiftDay(today, -1), {}, l, undefined, today)).toEqual([]);
    expect(handyOn(day, {}, [h('b', { from: '2026-11-20' })], undefined, today)).toEqual([]);
    expect(handyOn(day, {}, l, { [day]: ['b'] }, today)).toEqual([]);
    expect(handyOn('2026-11-19', {}, l, { [day]: ['b'] }, today)).toHaveLength(1);
    expect(handyOn(day, { [day]: [{ k: 'r', id: 'oats', s: 'breakfast' }] }, l, undefined, today)).toEqual([]);
  });
  it('puts each food in its own meal, else its usual meal, else the first meal; leaves out drinks and gone foods', () => {
    const l = [h('a', { id: 'oats' }), h('b', { id: 'beef', s: 'dinner' }), h('c', { id: 'beef' }), h('d', { id: 'tea' }), h('e', { id: 'gone' }), h('f', { id: 'abc' })];
    const t = handyTrays(day, {}, l, undefined, today, recipes, []);
    expect(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v!.map(x => x.r.rid)]))).toEqual({ breakfast: ['c', 'a'], dinner: ['b'], lunch: ['f'] });
    expect(trayMealOf(l[2]!, recipes)).toBe('breakfast');
    expect(handyMealFor({ k: 'r', id: 'beef' }, recipes)).toBe('breakfast');
    expect(handyMealFor({ k: 'r', id: 'abc' }, recipes)).toBe('lunch');
  });
  it('rows are A to Z with the numbers of one portion', () => {
    const t = handyTrays(day, {}, [h('a', { id: 'oats' }), h('b', { id: 'beef', s: 'breakfast', x: 2 })], undefined, today, recipes, []);
    expect(t.breakfast!.map(x => [x.res.name, x.res.kcal])).toEqual([['Beef', 600], ['Oats', 300]]);
  });
  it('saveRepeat: handy is every day, own cap of 24, repeats keep 12', () => {
    const r = saveRepeat([], { item: { k: 'r', id: 'oats', s: 'breakfast' }, days: [], from: today, handy: true });
    expect(r.list).toEqual([{ rid: 'rp1', k: 'r', id: 'oats', s: 'breakfast', days: every, from: today, h: true }]);
    let l: RepeatItem[] = [];
    for (let i = 0; i < MAX_HANDY; i++) l = saveRepeat(l, { item: { k: 'r', id: `h${i}` }, days: [], from: today, handy: true }).list!;
    expect(saveRepeat(l, { item: { k: 'r', id: 'more' }, days: [], from: today, handy: true }).error).toMatch(/24 foods handy/);
    expect(saveRepeat(l, { item: { k: 'r', id: 'more' }, days: [1], from: today }).error).toBeNull(); // repeats are counted apart
    let full: RepeatItem[] = [];
    for (let i = 0; i < MAX_REPEATS; i++) full = saveRepeat(full, { item: { k: 'r', id: `r${i}` }, days: [1], from: today }).list!;
    expect(saveRepeat(full, { item: { k: 'r', id: 'x' }, days: [], from: today, handy: true }).error).toBeNull();
    expect(saveRepeat(full, { item: { k: 'r', id: 'x' }, days: [1], from: today }).error).toMatch(/12 repeats/);
  });
  it('turns a handy item into a repeat and back, keeping its meal', () => {
    const l = [h('a', { id: 'beef', s: 'dinner' })];
    const rep2 = saveRepeat(l, { rid: 'a', item: { k: 'r', id: 'beef' }, days: weekdays, from: today }).list![0]!;
    expect(rep2).toEqual({ rid: 'a', k: 'r', id: 'beef', s: 'dinner', days: weekdays, from: today });
    const back = saveRepeat([rep2], { rid: 'a', item: { k: 'r', id: 'beef', s: 'dinner' }, days: [], from: today, handy: true }).list![0]!;
    expect(back).toMatchObject({ h: true, days: every, s: 'dinner' });
    expect(saveRepeat([rep('n', every, { id: 'beef' })], { rid: 'n', item: { k: 'r', id: 'beef', s: 'lunch' }, days: [], from: '2026-11-10', handy: true }).list![0]).toMatchObject({ s: 'lunch', from: '2026-11-10' });
  });
  it('a skip-on-leave never targets a handy item, so Remove on its start day returns it to the tray', () => {
    expect(skipsAfterLeaving([h('a', { id: 'beef', s: 'dinner' })], undefined, today, { k: 'r', id: 'beef', s: 'dinner' })).toBeUndefined();
  });
  it('names the handy clash plainly and prunes handy items that can no longer show', () => {
    expect(addRepeat([h('a', { id: 'beef' })], rep('n', [1], { id: 'beef' })).error).toMatch(/kept handy/);
    expect(addRepeat([rep('a', [1], { id: 'beef' })], rep('n', [1], { id: 'beef' })).error).toMatch(/already repeats/);
    const l = [h('a', { id: 'beef' }), h('b', { id: 'tea' }), h('c', { id: 'gone' }), h('d', { id: 'beef', k: 'm' }), rep('e', every, { id: 'gone' })];
    expect(ids(pruneHandy(l, recipes) as RepeatItem[])).toEqual(['a', 'e']);
    expect(pruneHandy([h('a', { id: 'beef' })], recipes)).toHaveLength(1);
  });
  it('removing an item added from the tray clears its skip; other items change nothing', () => {
    const l = [h('a', { id: 'beef', s: 'dinner' })], skips = { [day]: ['a', 'z'] };
    expect(skipsAfterRemovingHandy(l, skips, day, { k: 'r', id: 'beef', s: 'dinner' })).toEqual({ [day]: ['z'] });
    expect(skipsAfterRemovingHandy(l, skips, day, { k: 'r', id: 'beef', s: 'lunch' })).toBeUndefined();
    expect(skipsAfterRemovingHandy(l, undefined, day, { k: 'r', id: 'beef', s: 'dinner' })).toBeUndefined();
    expect(skipsAfterRemovingHandy([rep('a', every, { id: 'beef', s: 'dinner' })], skips, day, { k: 'r', id: 'beef', s: 'dinner' })).toBeUndefined();
  });
});

describe('planned repeats (brief nutrition-planned-available-tray)', () => {
  const day = '2026-11-18'; // a Wednesday, shown by an every-day repeat
  const stored = (n: number) => Array.from({ length: n }, (_, i) => ({ k: 'r' as const, id: `x${i}`, p: true as const }));
  it('a planned repeat shows as planned; an unplanned one does not', () => {
    expect(repeatPlanItem(rep('a', every, { p: true }))).toEqual({ k: 'r', id: 'oats', p: true, v: true, rp: 'a' });
    expect(repeatPlanItem(rep('a', every))).toEqual({ k: 'r', id: 'oats', v: true, rp: 'a' });
    expect(withRepeats({}, [rep('a', every, { p: true })], undefined, [day], today)[day]).toEqual([{ k: 'r', id: 'oats', p: true, v: true, rp: 'a' }]);
  });
  it('a day already holding 8 planned things draws the repeat as available, never a 9th planned', () => {
    const out = withRepeats({ [day]: stored(8) }, [rep('a', every, { p: true })], undefined, [day], today)[day]!;
    expect(out.at(-1)).toEqual({ k: 'r', id: 'oats', v: true, rp: 'a' });
    const seven = withRepeats({ [day]: stored(7) }, [rep('a', every, { p: true }), rep('b', every, { id: 'tea', p: true })], undefined, [day], today)[day]!;
    expect(seven.filter(i => i.p === true)).toHaveLength(8); // the first takes the last place, the second is available
    expect(seven.at(-1)!.p).toBeUndefined();
  });
  it('saving it again keeps p, and a handy item never carries p', () => {
    const r = saveRepeat([rep('a', [1, 3], { p: true })], { rid: 'a', item: { k: 'r', id: 'oats' }, days: [1, 2], from: today });
    expect(r.list![0]).toMatchObject({ days: [1, 2], p: true });
    const h = saveRepeat([rep('a', [1, 3], { p: true })], { rid: 'a', item: { k: 'r', id: 'oats' }, days: [1], from: today, handy: true });
    expect(h.list![0]).not.toHaveProperty('p');
    expect(h.list![0]).toMatchObject({ h: true });
  });
});
