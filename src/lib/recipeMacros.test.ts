import { describe, expect, it } from 'vitest';
import type { FoodHit } from '../shared/foods.js';
import { gramsOf, rowGrams, servingsFor, totals, totalsNote, type MacroRow } from './recipeMacros.js';

describe('gramsOf', () => {
  it('reads g, kg, oz and lb', () => {
    expect(gramsOf('200 g')).toBe(200); expect(gramsOf('200g')).toBe(200); expect(gramsOf('1.5 kg')).toBe(1500);
    expect(gramsOf('8 oz')).toBe(226.8); expect(gramsOf('½ lb')).toBe(226.8); expect(gramsOf('1 ½ lb')).toBe(680.4); expect(gramsOf('1 1/2 lb')).toBe(680.4);
    expect(gramsOf('2 Ounces')).toBe(56.7); expect(gramsOf('1 lb, diced')).toBe(453.6); expect(gramsOf('3 grams')).toBe(3);
  });
  it('gives null for anything it cannot turn into grams', () => {
    for (const a of ['2 cups', '3', 'pinch', '', '   ', '1 (14 oz) can', '2-3 oz', '1 lb / 450 g', '1 lb (450 g)', '2 tbsp', '1 egg', '0 g', '1/0 lb', 'g', undefined]) expect(gramsOf(a)).toBeNull();
  });
});

describe('rowGrams', () => {
  it('prefers what was typed, else reads the amount, else null', () => {
    expect(rowGrams('2 cups', '240')).toBe(240); expect(rowGrams('200 g', '')).toBe(200); expect(rowGrams('200 g', '150')).toBe(150);
    expect(rowGrams('2 cups', '')).toBeNull(); expect(rowGrams('2 cups', '0')).toBeNull(); expect(rowGrams('200 g', 'abc')).toBeNull(); expect(rowGrams('10 kg', '')).toBeNull();
  });
});

describe('servingsFor', () => {
  it('takes a whole number 1 to 99, else 1 and says it assumed', () => {
    expect(servingsFor('4')).toEqual({ servings: 4, assumed: false }); expect(servingsFor(' 12 ')).toEqual({ servings: 12, assumed: false });
    for (const t of ['', '0', 'x', '100', '2.5']) expect(servingsFor(t)).toEqual({ servings: 1, assumed: true });
  });
});

const chicken: FoodHit = { id: 1, name: 'Chicken', kcal: 120, p: 22.5, c: 0, f: 2.6 };
const rice: FoodHit = { id: 2, name: 'Rice', kcal: 130, p: 2.7, c: 28, f: 0.3 };
const salt: FoodHit = { id: 3, name: 'Seasoning', kcal: 50, p: 1 };
const row = (name: string, grams: number | null, hit: FoodHit | null): MacroRow => ({ name, grams, hit });

describe('totals', () => {
  it('adds each food scaled to its grams and divides by servings', () => {
    const t = totals([row('chicken', 400, chicken), row('rice', 200, rice)], 2);
    expect(t.per).toEqual({ kcal: 370, p: 47.7, c: 28, f: 5.5 });
    expect(t.counted).toBe(2); expect(t.total).toBe(2); expect(t.leftOut).toEqual([]); expect(t.missing).toEqual([]);
  });
  it('leaves out rows with no food or no grams and names them', () => {
    const t = totals([row('chicken', 100, chicken), row('rice', null, rice), row('salt', 5, null)], 1);
    expect(t.counted).toBe(1); expect(t.total).toBe(3); expect(t.leftOut).toEqual(['rice', 'salt']); expect(t.per.kcal).toBe(120);
  });
  it('fills carbs and fat only when every counted food has them', () => {
    const t = totals([row('chicken', 100, chicken), row('mix', 10, salt)], 1);
    expect(t.per).toEqual({ kcal: 125, p: 22.6 }); expect(t.missing).toEqual(['carbs', 'fat']);
    expect(totals([row('a', 100, { ...chicken, f: undefined })], 1).missing).toEqual(['fat']);
  });
  it('is all zero with nothing counted', () => {
    const t = totals([row('rice', null, null)], 1);
    expect(t.per).toEqual({ kcal: 0, p: 0 }); expect(t.counted).toBe(0); expect(t.missing).toEqual([]); expect(totals([], 1).total).toBe(0);
  });
  it('rounds once, at the end', () => {
    expect(totals([row('a', 33, { id: 9, name: 'x', kcal: 100, p: 1 }), row('b', 33, { id: 9, name: 'x', kcal: 100, p: 1 })], 3).per.kcal).toBe(22);
  });
});

describe('totalsNote', () => {
  it('says how many were counted, what was left out and what is missing', () => {
    expect(totalsNote({ per: { kcal: 1, p: 1 }, counted: 4, total: 6, leftOut: ['salt', 'oil'], missing: ['carbs', 'fat'] })).toBe('Counted 4 of 6 ingredients. Left out: salt, oil. Some foods have no carbs or fat, so those stay as typed.');
    expect(totalsNote({ per: { kcal: 1, p: 1 }, counted: 1, total: 1, leftOut: [], missing: ['fat'] })).toBe('Counted 1 of 1 ingredient. Some foods have no fat, so that stays as typed.');
  });
});
