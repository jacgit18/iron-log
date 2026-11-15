import { describe, expect, it } from 'vitest';
import { MAX_DAILY_SNACKS, normDietCfg, normSnackSkips, normSnacks } from '../shared/diet.js';
import type { DietCfg, Recipe } from '../types.ts';
import { boardDay } from './weekBoard.js';
import { addSnack, effectivePlan, removeSnack, setSnackPortion, skipSnack, snackPortion, snacksShownOn } from './dailySnacks.js';

const today = '2026-11-12', tomorrow = '2026-11-13', far = '2026-11-26';
const recipes: Recipe[] = [
  { id: 'yog', n: 'Yogurt', cat: 'sides', ing: [], steps: [], kcal: 120, p: 17 },
  { id: 'bar', n: 'Bar', cat: 'sides', ing: [], steps: [], kcal: 210, p: 20 },
];

describe('which listed snacks show on a day', () => {
  const list = [{ id: 'yog' }, { id: 'bar', x: 2 }];
  it('shows every listed snack on a day with nothing planned', () => { expect(snacksShownOn(today, {}, list).map(s => s.id)).toEqual(['yog', 'bar']); });
  it('hides one skipped that day only', () => {
    expect(snacksShownOn(today, {}, list, { [today]: ['yog'] }).map(s => s.id)).toEqual(['bar']);
    expect(snacksShownOn(tomorrow, {}, list, { [today]: ['yog'] }).map(s => s.id)).toEqual(['yog', 'bar']);
  });
  it('hides one that is already a real item in any meal, so it never shows twice', () => {
    expect(snacksShownOn(today, { [today]: [{ k: 'r', id: 'yog', s: 'snack' }] }, list).map(s => s.id)).toEqual(['bar']);
    expect(snacksShownOn(today, { [today]: [{ k: 'r', id: 'yog', s: 'dinner' }] }, list).map(s => s.id)).toEqual(['bar']);
  });
  it('shows nothing without a list', () => { expect(snacksShownOn(today, {}, undefined)).toEqual([]); });
});

describe('the plan as the board shows it', () => {
  const diet: DietCfg = { snacks: [{ id: 'yog' }, { id: 'bar', x: 2 }], plan: { [today]: [{ k: 'r', id: 'yog', s: 'lunch' }] } };
  it('adds the shown snacks to Snack after the real items, marked as not stored', () => {
    const p = effectivePlan(diet, [today, tomorrow], today);
    expect(p[today]).toEqual([{ k: 'r', id: 'yog', s: 'lunch' }, { k: 'r', id: 'bar', x: 2, s: 'snack', v: true }]);
    expect(p[tomorrow]).toEqual([{ k: 'r', id: 'yog', s: 'snack', v: true }, { k: 'r', id: 'bar', x: 2, s: 'snack', v: true }]);
  });
  it('leaves the stored plan alone', () => { effectivePlan(diet, [today], today); expect(diet.plan![today]).toHaveLength(1); });
  it('adds nothing outside today and the next 13 days', () => {
    expect(effectivePlan(diet, ['2026-11-11'], today)['2026-11-11']).toBeUndefined();
    expect(effectivePlan(diet, [far], today)[far]).toBeUndefined();
  });
  it('returns the same object when there is nothing to add', () => {
    const plain: DietCfg = { plan: { [today]: [{ k: 'r', id: 'yog' }] } };
    expect(effectivePlan(plain, [today], today)).toBe(plain.plan);
    expect(effectivePlan(undefined, [today], today)).toEqual({});
  });
  it('counts the snacks in the day and keeps them in Snack, between Lunch and Dinner', () => {
    const d = boardDay(effectivePlan({ snacks: [{ id: 'yog' }, { id: 'bar' }] }, [tomorrow], today), tomorrow, recipes, [], 2000);
    expect(d.slots.map(s => s.slot)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']); // no "not set" group: every item has a meal
    const snack = d.slots.find(s => s.slot === 'snack')!;
    expect(snack.items.map(i => i.r.name)).toEqual(['Yogurt', 'Bar']);
    expect(snack.items.every(i => i.virtual)).toBe(true);
    expect(d.kcal).toBe(330);
    expect(snack.kcal).toBe(330);
  });
});

describe('editing the list', () => {
  it('adds with portion 1, refuses a repeat, stops at the limit', () => {
    expect(addSnack([], 'yog')).toEqual({ list: [{ id: 'yog' }], error: null });
    expect(addSnack([{ id: 'yog' }], 'yog')).toMatchObject({ list: null });
    const full = Array.from({ length: MAX_DAILY_SNACKS }, (_, i) => ({ id: `s${i}` }));
    expect(addSnack(full, 'x')).toEqual({ list: null, error: 'You can keep 6 daily snacks.' });
  });
  it('removes one and changes its portion in half steps', () => {
    expect(removeSnack([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }]);
    expect(setSnackPortion([{ id: 'a' }], 'a', 1.5)).toEqual([{ id: 'a', x: 1.5 }]);
    expect(setSnackPortion([{ id: 'a', x: 2 }], 'a', 1)).toEqual([{ id: 'a' }]);
    expect(setSnackPortion([{ id: 'a' }], 'a', 0.25)).toEqual([{ id: 'a' }]);
    expect(snackPortion({ id: 'a' })).toBe(1);
    expect(snackPortion({ id: 'a', x: 2.5 })).toBe(2.5);
  });
  it('skips on one day, once', () => {
    expect(skipSnack(undefined, today, 'a')).toEqual({ [today]: ['a'] });
    expect(skipSnack({ [today]: ['a'] }, today, 'a')).toEqual({ [today]: ['a'] });
    expect(skipSnack({ [today]: ['a'] }, tomorrow, 'a')).toEqual({ [today]: ['a'], [tomorrow]: ['a'] });
  });
});

describe('what is stored is cleaned', () => {
  it('keeps ids, drops repeats and junk, caps the list, keeps only half-step portions', () => {
    const raw = [{ id: 'a', x: 1.5 }, { id: 'a' }, { id: '' }, 'x', { id: 'b', x: 1 }, { id: 'c', x: 0.3 }, ...Array.from({ length: 9 }, (_, i) => ({ id: `n${i}` }))];
    const out = normSnacks(raw);
    expect(out.slice(0, 3)).toEqual([{ id: 'a', x: 1.5 }, { id: 'b' }, { id: 'c' }]);
    expect(out).toHaveLength(MAX_DAILY_SNACKS);
    expect(normSnacks('nope')).toEqual([]);
  });
  it('drops skips for bad dates and, with a day, outside the window', () => {
    const raw = { [today]: ['a', 'a', 'b'], '2026-11-11': ['a'], [far]: ['a'], nope: ['a'], [tomorrow]: [] };
    expect(normSnackSkips(raw, today)).toEqual({ [today]: ['a', 'b'] });
    expect(Object.keys(normSnackSkips(raw))).toEqual(['2026-11-11', today, far]);
  });
  it('round trips through the diet settings and leaves no empty keys', () => {
    const cfg: DietCfg = { snacks: [{ id: 'yog', x: 2 }], snackSkips: { [today]: ['yog'] } };
    expect(normDietCfg(cfg, today)).toEqual(cfg);
    expect(normDietCfg({ snacks: [], snackSkips: {} }, today)).toBeUndefined();
  });
});
