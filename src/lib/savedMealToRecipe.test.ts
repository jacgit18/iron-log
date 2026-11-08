import { describe, expect, it } from 'vitest';
import { normDietCfg, normMealsMoved } from '../shared/diet.js';
import type { Recipe, SavedMeal } from '../types.ts';
import { savedMealToRecipe } from './savedMealToRecipe.js';

const rec = (id: string, n: string, kcal: number, p: number, cat: Recipe['cat'] = 'carbs'): Recipe => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
const rice = rec('rice', 'Rice', 200, 4), chili = rec('chili', 'Chili', 400, 30, 'protein');

describe('savedMealToRecipe', () => {
  it('links every food that is still a recipe with the same numbers, at the servings it was logged', () => {
    const meal: SavedMeal = { id: 'm1', n: 'Dinner', items: [{ n: 'Chili', kcal: 800, p: 60, from: 'chili' }, { n: 'Rice', kcal: 200, p: 4, from: 'rice' }] };
    const r = savedMealToRecipe(meal, [rice, chili]);
    expect(r.ing).toEqual([{ n: 'Chili', rid: 'chili', q: 2 }, { n: 'Rice', rid: 'rice', q: 1 }]);
    expect(r.kcal).toBeUndefined(); // it rolls up from the parts
    expect(r).toMatchObject({ n: 'Dinner', cat: 'other', servings: 1 });
  });
  it('keeps the exact saved totals when a food is gone, changed since, or never came from a recipe', () => {
    const base = [{ n: 'Chili', kcal: 800, p: 60, from: 'chili' }, { n: 'Rice', kcal: 200, p: 4, from: 'rice' }];
    for (const [meal, list] of [
      [{ id: 'm', n: 'A', items: base }, [chili]], // rice is gone
      [{ id: 'm', n: 'A', items: base }, [chili, { ...rice, kcal: 260 }]], // rice changed since
      [{ id: 'm', n: 'A', items: [...base.slice(0, 1), { n: 'Apple', kcal: 95, p: 0 }] }, [chili, rice]], // one never came from a recipe
    ] as [SavedMeal, Recipe[]][]) {
      const r = savedMealToRecipe(meal, list);
      expect(r.ing.every(i => i.rid === undefined)).toBe(true);
      expect(r.kcal).toBe(meal.items.reduce((a, i) => a + i.kcal, 0));
      expect(r.p).toBe(meal.items.reduce((a, i) => a + i.p, 0));
    }
  });
  it('sums carbs and fat only when every food has them', () => {
    const r = savedMealToRecipe({ id: 'm', n: 'A', items: [{ n: 'a', kcal: 100, p: 5, c: 10, f: 2 }, { n: 'b', kcal: 50, p: 1, c: 5, f: 1 }] }, []);
    expect(r).toMatchObject({ kcal: 150, p: 6, c: 15, f: 3 });
    expect(savedMealToRecipe({ id: 'm', n: 'A', items: [{ n: 'a', kcal: 100, p: 5, c: 10 }, { n: 'b', kcal: 50, p: 1 }] }, [])).not.toHaveProperty('c');
  });
  it('never links a sauce, and adds (saved) when a recipe already has the name', () => {
    const salsa = rec('salsa', 'Salsa', 20, 1, 'sauces');
    const r = savedMealToRecipe({ id: 'm', n: 'rice', items: [{ n: 'Salsa', kcal: 20, p: 1, from: 'salsa' }] }, [salsa, rice]);
    expect(r.ing).toEqual([{ n: 'Salsa' }]);
    expect(r.n).toBe('rice (saved)');
  });
});

describe('mealsMoved', () => {
  it('keeps text ids, drops the rest and caps the count', () => {
    expect(normMealsMoved({ a: 'r1', b: 5, '': 'x', c: '' })).toEqual({ a: 'r1' });
    expect(normMealsMoved(['x'])).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`m${i}`, `r${i}`]));
    expect(Object.keys(normMealsMoved(many))).toHaveLength(30);
  });
  it('survives the diet settings cleaner as it came', () => {
    const cfg = normDietCfg({ kcal: 2000, mealsMoved: { m1: 'r1' } });
    expect(cfg?.mealsMoved).toEqual({ m1: 'r1' });
    expect(normDietCfg({ mealsMoved: {} })).toBeUndefined();
  });
});
