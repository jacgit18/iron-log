import { describe, expect, it } from 'vitest';
import type { DietEntry, SavedMeal } from '../types.ts';
import { MAX_DIET_PER_DAY, MAX_MEALS, MAX_MEAL_ITEMS } from '../shared/diet.js';
import { mealLine, mealTotals, planMeal, renameMeal, saveMeal, sortedMeals } from './dietMeals.js';

let n = 0;
const e = (name: string, kcal = 100, extra: Partial<DietEntry> = {}, d = '2026-10-30'): DietEntry => ({ id: `e${++n}`, d, n: name, kcal, p: 5, ...extra });
const meal = (id: string, name: string, k = 100): SavedMeal => ({ id, n: name, items: [{ n: 'X', kcal: k, p: 1 }] });

describe('saveMeal', () => {
  it('makes a meal from the foods, keeping numbers and recipe link but not the day', () => {
    const r = saveMeal([], ' Breakfast ', [e('Oats', 350, { c: 60, f: 6 }), e('Chili', 600, { from: 'r1' })], 'm1');
    expect(r.error).toBeNull();
    expect(r.meals).toEqual([{ id: 'm1', n: 'Breakfast', items: [{ n: 'Oats', kcal: 350, p: 5, c: 60, f: 6 }, { n: 'Chili', kcal: 600, p: 5, from: 'r1' }] }]);
  });
  it('replaces a meal of the same name in place, keeping its id', () => {
    const r = saveMeal([meal('a', 'Lunch'), meal('b', 'Breakfast')], 'breakfast', [e('Toast', 90)], 'new');
    expect(r.meals!.map(m => [m.id, m.n])).toEqual([['a', 'Lunch'], ['b', 'breakfast']]);
    expect(r.meals![1]!.items[0]!.n).toBe('Toast');
  });
  it('refuses a blank name, nothing ticked and too many foods', () => {
    expect(saveMeal([], '  ', [e('A')], 'm').error).toMatch(/name/);
    expect(saveMeal([], 'Meal', [], 'm').error).toMatch(/Tick at least one/);
    expect(saveMeal([], 'Meal', Array.from({ length: MAX_MEAL_ITEMS + 1 }, () => e('A')), 'm').error).toContain(String(MAX_MEAL_ITEMS));
  });
  it('refuses a new meal when the list is full but still replaces one by name', () => {
    const full = Array.from({ length: MAX_MEALS }, (_, i) => meal(`m${i}`, `Meal ${i}`));
    expect(saveMeal(full, 'Another', [e('A')], 'x').error).toContain(String(MAX_MEALS));
    expect(saveMeal(full, 'meal 3', [e('A')], 'x').error).toBeNull();
  });
  it('cuts a long name', () => { expect(saveMeal([], 'x'.repeat(60), [e('A')], 'm').meals![0]!.n).toHaveLength(40); });
});

describe('renameMeal', () => {
  const l = [meal('a', 'Lunch'), meal('b', 'Breakfast')];
  it('renames, and may change only the case of its own name', () => {
    expect(renameMeal(l, 'a', 'Dinner').meals!.map(m => m.n)).toEqual(['Dinner', 'Breakfast']);
    expect(renameMeal(l, 'a', 'LUNCH').meals![0]!.n).toBe('LUNCH');
  });
  it('refuses blank, a name another meal has, and a meal that is gone', () => {
    expect(renameMeal(l, 'a', ' ').error).toMatch(/name/);
    expect(renameMeal(l, 'a', 'breakfast').error).toMatch(/already/);
    expect(renameMeal(l, 'zzz', 'Q').error).toMatch(/gone/);
  });
});

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

describe('sortedMeals', () => {
  const m = (id: string, n: string): SavedMeal => ({ id, n, items: [] });
  it('lists A to Z, ignoring case and reading digits as numbers, without changing the input', () => {
    const stored = [m('a', 'zucchini bowl'), m('b', 'Meal 10'), m('c', 'apple oats'), m('d', 'Meal 2')];
    expect(sortedMeals(stored).map(x => x.n)).toEqual(['apple oats', 'Meal 2', 'Meal 10', 'zucchini bowl']);
    expect(stored.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('keeps equal names in id order', () => {
    expect(sortedMeals([m('b', 'Lunch'), m('a', 'lunch')]).map(x => x.id)).toEqual(['a', 'b']);
  });
});
