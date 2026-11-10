import { describe, expect, it } from 'vitest';
import type { Recipe, SavedMeal } from '../types.ts';
import { mealItems, moveMeals, quickMeals, quickRows, remapPlan } from './quickMeals.js';

const rec = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'carbs', ing: [{ n: 'x' }], steps: ['Cook.'], ...extra });
const rice = rec('rice', 'Rice', { kcal: 200, p: 4 }), chili = rec('chili', 'Chili', { cat: 'protein', kcal: 400, p: 30 });
const linked = rec('dinner', 'Dinner', { cat: 'other', ing: [{ n: 'Chili', rid: 'chili', q: 2 }, { n: 'Rice', rid: 'rice', q: 1 }], kcal: 1000, p: 64 });
const plain = rec('snack', 'Snack box', { cat: 'other', kcal: 300, p: 12 });

describe('quickMeals', () => {
  it('lists linked meals and plain Other meals with numbers, A to Z, and nothing else', () => {
    const noNum = rec('x', 'Mystery', { cat: 'other' });
    expect(quickMeals([rice, plain, chili, linked, noNum]).map(r => r.id)).toEqual(['dinner', 'snack']);
  });
});

describe('mealItems', () => {
  it('gives each linked part at its amount, as its own food', () => {
    expect(mealItems(linked, [rice, chili, linked])).toEqual([{ n: 'Chili', kcal: 800, p: 60, from: 'chili' }, { n: 'Rice', kcal: 200, p: 4, from: 'rice' }]);
  });
  it('leaves out a part that is gone, and falls back to the meal itself when none is left', () => {
    expect(mealItems(linked, [rice, linked]).map(i => i.n)).toEqual(['Rice']);
    expect(mealItems(linked, [linked])).toEqual([{ n: 'Dinner', kcal: 1000, p: 64 }]);
  });
  it('gives one entry with the totals for a plain meal or one on its own numbers, none without numbers', () => {
    expect(mealItems(plain, [plain])).toEqual([{ n: 'Snack box', kcal: 300, p: 12 }]);
    expect(mealItems({ ...linked, own: true }, [rice, chili])).toEqual([{ n: 'Dinner', kcal: 1000, p: 64 }]);
    expect(mealItems(rec('x', 'None', { cat: 'other' }), [])).toEqual([]);
  });
});

describe('moveMeals', () => {
  const meals: SavedMeal[] = [{ id: 'm1', n: 'Dinner', items: [{ n: 'Chili', kcal: 800, p: 60, from: 'chili' }, { n: 'Rice', kcal: 200, p: 4, from: 'rice' }] }, { id: 'm2', n: 'Apple plate', items: [{ n: 'Apple', kcal: 95, p: 0 }] }];
  it('moves each saved meal once and records where it went', () => {
    const a = moveMeals(meals, {}, [rice, chili]);
    expect(a.added).toBe(2);
    expect(Object.keys(a.moved)).toEqual(['m1', 'm2']);
    expect(a.recipes).toHaveLength(4);
    const again = moveMeals(meals, a.moved, a.recipes);
    expect(again.added).toBe(0);
    expect(again.recipes).toBe(a.recipes);
  });
  it('does not make a meal again when its recipe was renamed or deleted since', () => {
    const a = moveMeals(meals, {}, [rice, chili]);
    const b = moveMeals(meals, a.moved, a.recipes.filter(r => r.id !== a.moved.m2));
    expect(b.added).toBe(0);
  });
  it('stops at the recipe limit and says so', () => {
    const full = Array.from({ length: 300 }, (_, i) => rec(`r${i}`, `R${i}`));
    const r = moveMeals(meals, {}, full);
    expect(r.limited).toBe(true);
    expect(r.added).toBe(0);
  });
});

describe('moveMeals link depth', () => {
  it('keeps the saved totals, with no links, when a linked part would nest meals too deep', () => {
    const mk = (id: string, ing: Recipe['ing']) => rec(id, id, { cat: 'other', ing, kcal: 200, p: 4 });
    const m1 = mk('m1', [{ n: 'Rice', rid: 'rice', q: 1 }]), m2 = mk('m2', [{ n: 'm1', rid: 'm1', q: 1 }]), m3 = mk('m3', [{ n: 'm2', rid: 'm2', q: 1 }]);
    const meal: SavedMeal = { id: 's1', n: 'Deep', items: [{ n: 'm3', kcal: 200, p: 4, from: 'm3' }] };
    const r = moveMeals([meal], {}, [rice, m1, m2, m3]);
    const made = r.recipes.find(x => x.n === 'Deep')!;
    expect(made.ing.every(i => i.rid === undefined)).toBe(true);
    expect(made).toMatchObject({ kcal: 200, p: 4 });
    expect(r.moved).toEqual({ s1: made.id });
  });
  it('still links a part that fits', () => {
    const meal: SavedMeal = { id: 's1', n: 'Plate', items: [{ n: 'Rice', kcal: 200, p: 4, from: 'rice' }] };
    const made = moveMeals([meal], {}, [rice]).recipes.find(x => x.n === 'Plate')!;
    expect(made.ing[0]).toMatchObject({ rid: 'rice', q: 1 });
  });
});

describe('quickRows', () => {
  const saved: SavedMeal[] = [{ id: 'a', n: 'Waiting', items: [{ n: 'Oats', kcal: 300, p: 10 }] }, { id: 'b', n: 'Moved', items: [{ n: 'Eggs', kcal: 150, p: 12 }] }];
  it('lists Recipes meals and saved meals not yet moved together, A to Z, and marks the waiting ones', () => {
    const rows = quickRows([linked, rice, chili, plain], saved, { b: 'snack' });
    expect(rows.map(r => [r.n, r.waiting])).toEqual([['Dinner', false], ['Snack box', false], ['Waiting', true]]);
  });
  it('gives a recipe and a saved meal with one id different row ids, and drops a meal with no foods', () => {
    const rows = quickRows([rec('a', 'Cake', { cat: 'other', kcal: 100, p: 1 })], [{ id: 'a', n: 'Pie', items: [{ n: 'x', kcal: 1, p: 0 }] }, { id: 'e', n: 'Empty', items: [] }], {});
    expect(rows.map(r => r.id)).toEqual(['r:a', 's:a']);
  });
});

describe('remapPlan', () => {
  it('points a saved-meal item at the recipe it became and leaves the rest', () => {
    const plan = { '2026-11-09': [{ k: 'm' as const, id: 'm1' }, { k: 'r' as const, id: 'rice', x: 2 }] };
    expect(remapPlan(plan, { m1: 'dinner' })).toEqual({ '2026-11-09': [{ k: 'r', id: 'dinner' }, { k: 'r', id: 'rice', x: 2 }] });
    expect(remapPlan(plan, {})).toBe(plan);
    expect(remapPlan(undefined, { m1: 'x' })).toBeUndefined();
  });
});
