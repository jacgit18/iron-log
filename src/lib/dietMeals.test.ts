import { describe, expect, it } from 'vitest';
import type { DietEntry, SavedMeal } from '../types.ts';
import { MAX_DIET_PER_DAY } from '../shared/diet.js';
import { mealLine, mealTotals, planMeal } from './dietMeals.js';

let n = 0;
const e = (name: string, kcal = 100, extra: Partial<DietEntry> = {}, d = '2026-10-30'): DietEntry => ({ id: `e${++n}`, d, n: name, kcal, p: 5, ...extra });
const meal = (id: string, name: string, k = 100): SavedMeal => ({ id, n: name, items: [{ n: 'X', kcal: k, p: 1 }] });

describe('mealLine and mealTotals', () => {
  const m: SavedMeal = { id: 'a', n: 'Breakfast', items: [{ n: 'Oats', kcal: 350, p: 12 }, { n: 'Whey', kcal: 1200, p: 25 }] };
  it('adds up and words it', () => { expect(mealTotals(m)).toEqual({ kcal: 1550, foods: 2 }); expect(mealLine(m)).toBe('Breakfast · 2 foods · 1,550 kcal'); });
  it('says "1 food" for one', () => { expect(mealLine(meal('a', 'Snack', 90))).toBe('Snack · 1 food · 90 kcal'); });
});

describe('planMeal', () => {
  const m: SavedMeal = { id: 'a', n: 'M', items: [{ n: '1', kcal: 1, p: 0 }, { n: '2', kcal: 1, p: 0 }, { n: '3', kcal: 1, p: 0 }] };
  it('adds every food when the day has room', () => { expect(planMeal([], '2026-10-30', m)).toEqual({ add: m.items, left: 0 }); });
  it('adds what fits under the per-day limit and counts the rest', () => {
    const day = Array.from({ length: MAX_DIET_PER_DAY - 1 }, () => e('F'));
    const r = planMeal(day, '2026-10-30', m);
    expect(r.add).toEqual([m.items[0]]); expect(r.left).toBe(2);
  });
  it('counts only the viewed day', () => {
    const other = Array.from({ length: MAX_DIET_PER_DAY }, () => e('F', 1, {}, '2026-10-29'));
    expect(planMeal(other, '2026-10-30', m).left).toBe(0);
  });
});
