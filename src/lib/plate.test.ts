import { describe, expect, it } from 'vitest';
import { normDietCfg } from '../shared/diet.js';
import { cleanCounts, normRecipe, validRecipe } from '../shared/recipes.js';
import type { Recipe } from '../types.ts';
import { addItem } from './dietPlan.js';
import { FAT_PARTIAL_FROM, SLOT_SHARE, fatBarState, fatCoverage, marksOf, plateCheck } from './plate.js';

const rec = (id: string, cat: Recipe['cat'], extra: Partial<Recipe> = {}): Recipe => ({ id, n: id, cat, ing: [{ n: 'x' }], steps: ['Cook.'], ...extra });
const chili = rec('chili', 'protein', { p: 30 }), rice = rec('rice', 'carbs'), salad = rec('salad', 'sides'), bowl = rec('bowl', 'other', { p: 48, counts: ['protein', 'carb', 'veg'] });

describe('contract: slot and counts survive the cleaners', () => {
  it('keeps a valid slot on a planned item and drops an unknown one', () => {
    const cfg = normDietCfg({ plan: { '2099-01-01': [{ k: 'r', id: 'a', s: 'dinner' }, { k: 'r', id: 'b', s: 'brunch' }] } });
    expect(cfg?.plan?.['2099-01-01']).toEqual([{ k: 'r', id: 'a', s: 'dinner' }, { k: 'r', id: 'b' }]);
  });
  it('allows the same food in two meals of a day, and still drops a repeat in one', () => {
    const cfg = normDietCfg({ plan: { '2099-01-01': [{ k: 'r', id: 'a', s: 'lunch' }, { k: 'r', id: 'a', s: 'dinner' }, { k: 'r', id: 'a', s: 'dinner' }] } });
    expect(cfg?.plan?.['2099-01-01']).toHaveLength(2);
    const added = addItem({ '2099-01-01': [{ k: 'r', id: 'a', s: 'lunch' }] }, '2099-01-01', { k: 'r', id: 'a', s: 'dinner' }, '2099-01-01');
    expect(added.error).toBeNull();
    expect(addItem(added.plan!, '2099-01-01', { k: 'r', id: 'a', s: 'dinner' }, '2099-01-01').error).toMatch(/already/);
  });
  it('keeps valid counts in order, once each, and round-trips a recipe', () => {
    expect(cleanCounts(['veg', 'protein', 'protein', 'fat'])).toEqual(['protein', 'veg']);
    expect(cleanCounts([])).toBeNull();
    const r = rec('x', 'other', { counts: ['protein', 'veg'] });
    expect(validRecipe(r)).toBe(true);
    expect(normRecipe(r)?.counts).toEqual(['protein', 'veg']);
  });
});

describe('marksOf', () => {
  it('derives from the category, and adds protein at about 25 g or more', () => {
    expect(marksOf(chili)).toEqual(['protein']);
    expect(marksOf(rice)).toEqual(['carb']);
    expect(marksOf(salad)).toEqual(['veg']);
    expect(marksOf(rec('shake', 'drinks', { p: 40 }))).toEqual(['protein']);
    expect(marksOf(rec('plain', 'other'))).toEqual([]);
  });
  it('lets what the person set win over the derived marks', () => {
    expect(marksOf({ ...rice, counts: ['veg'] })).toEqual(['veg']);
  });
  it('gives a meal built from foods everything its parts cover', () => {
    const meal = rec('dinner', 'other', { ing: [{ n: 'Chili', rid: 'chili', q: 1 }, { n: 'Rice', rid: 'rice', q: 1 }] });
    expect(marksOf(meal, [chili, rice, meal])).toEqual(['protein', 'carb']);
  });
});

describe('plateCheck', () => {
  it('says what dinner is missing and what it has', () => {
    expect(plateCheck('dinner', [chili])).toEqual({ need: ['protein', 'carb', 'veg'], have: ['protein'], missing: ['carb', 'veg'] });
    expect(plateCheck('dinner', [chili, rice, salad]).missing).toEqual([]);
    expect(plateCheck('dinner', [bowl]).missing).toEqual([]);
  });
  it('needs no veg at breakfast, checks nothing for a snack or an empty slot', () => {
    expect(plateCheck('breakfast', [chili, rice]).missing).toEqual([]);
    expect(plateCheck('snack', [rice]).need).toEqual([]);
    expect(plateCheck('lunch', []).need).toEqual([]);
  });
  it('shares the day across the slots', () => expect(Object.values(SLOT_SHARE).reduce((a, b) => a + b, 0)).toBeCloseTo(1));
});

describe('fat bar honesty', () => {
  it('is whole when every food has fat, hatched from 70% of the calories, hidden below', () => {
    const f = (kcal: number, fat?: number, x = 1) => ({ r: { kcal, ...(fat !== undefined ? { f: fat } : {}) }, x });
    expect(fatCoverage([f(400, 14), f(200, 1)])).toBe(1);
    expect(fatBarState(fatCoverage([f(400, 14), f(200, 1)]))).toBe('full');
    expect(fatCoverage([f(700, 20), f(300)])).toBeCloseTo(0.7);
    expect(fatBarState(0.7)).toBe('partial');
    expect(fatBarState(FAT_PARTIAL_FROM - 0.01)).toBe('hidden');
    expect(fatCoverage([])).toBe(1);
    expect(fatCoverage([f(100, 5, 2), f(100, undefined, 2)])).toBe(0.5);
  });
});
