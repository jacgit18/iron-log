import { describe, expect, it } from 'vitest';
import { cleanGrams, cleanHits, cleanQuery, defaultGrams, hitLabel, MAX_RESULTS, parseFoods, scaleFood } from './foods.js';

const nut = (n: string, v: number) => ({ nutrientNumber: n, value: v });
const food = (over: Record<string, unknown> = {}) => ({ fdcId: 1, description: 'Chicken breast, raw', dataType: 'SR Legacy', foodNutrients: [nut('208', 120), nut('203', 22.5), nut('205', 0), nut('204', 2.6)], ...over });

describe('cleanQuery', () => {
  it('trims and squeezes spaces', () => { expect(cleanQuery('  chicken   breast ')).toBe('chicken breast'); });
  it('refuses short, long and non-text', () => {
    expect(cleanQuery('a')).toBeNull(); expect(cleanQuery(' b ')).toBeNull(); expect(cleanQuery('x'.repeat(61))).toBeNull(); expect(cleanQuery(5)).toBeNull(); expect(cleanQuery(undefined)).toBeNull();
    expect(cleanQuery('ab')).toBe('ab');
  });
});

describe('parseFoods', () => {
  it('reads the four numbers per 100 g', () => {
    expect(parseFoods({ foods: [food()] })).toEqual([{ id: 1, name: 'Chicken breast, raw', kcal: 120, p: 22.5, c: 0, f: 2.6 }]);
  });
  it('reads the abridged field names too', () => {
    const f = food({ foodNutrients: [{ number: '208', amount: 50 }, { number: 203, amount: 1 }] });
    expect(parseFoods({ foods: [f] })[0]).toMatchObject({ kcal: 50, p: 1 });
  });
  it('uses Atwater energy when 208 is missing, and leaves out carbs and fat it does not have', () => {
    const f = food({ foodNutrients: [nut('958', 99.6), nut('203', 5)] });
    expect(parseFoods({ foods: [f] })[0]).toEqual({ id: 1, name: 'Chicken breast, raw', kcal: 100, p: 5 });
  });
  it('skips a food with no calories, no protein, zero calories or no id', () => {
    const l = [food({ foodNutrients: [nut('203', 5)] }), food({ foodNutrients: [nut('208', 5)] }), food({ foodNutrients: [nut('208', 0), nut('203', 1)] }), food({ fdcId: 'x' }), food({ description: ' ' }), null, 7];
    expect(parseFoods({ foods: l })).toEqual([]);
  });
  it('keeps the brand and a serving in grams, and ignores other units', () => {
    const b = food({ brandName: 'Acme', servingSize: 28.35, servingSizeUnit: 'g' });
    expect(parseFoods({ foods: [b] })[0]).toMatchObject({ brand: 'Acme', serving: 28.4 });
    expect(parseFoods({ foods: [food({ brandOwner: 'Owner', servingSize: 240, servingSizeUnit: 'ml' })] })[0]).toEqual({ id: 1, name: 'Chicken breast, raw', brand: 'Owner', kcal: 120, p: 22.5, c: 0, f: 2.6 });
    expect(parseFoods({ foods: [food({ servingSize: 'x', servingSizeUnit: 'GRM' })] })[0]!.serving).toBeUndefined();
  });
  it('stops at the result limit and survives junk', () => {
    expect(parseFoods({ foods: Array.from({ length: 20 }, (_, i) => food({ fdcId: i + 1 })) })).toHaveLength(MAX_RESULTS);
    expect(parseFoods(null)).toEqual([]); expect(parseFoods({})).toEqual([]); expect(parseFoods({ foods: 'x' })).toEqual([]); expect(parseFoods([])).toEqual([]);
  });
});

describe('cleanHits', () => {
  it('keeps good hits and drops bad ones', () => {
    const r = cleanHits({ hits: [{ id: 1, name: 'Rice', kcal: 130, p: 2.7, c: 28 }, { id: 2, name: '', kcal: 1, p: 1 }, { id: 3, name: 'Bad', kcal: -1, p: 1 }, 'x'] });
    expect(r).toEqual([{ id: 1, name: 'Rice', kcal: 130, p: 2.7, c: 28 }]);
    expect(cleanHits(null)).toEqual([]); expect(cleanHits({ hits: 3 })).toEqual([]);
  });
});

describe('cleanGrams', () => {
  it('accepts 0 < g <= 5000', () => {
    expect(cleanGrams('150')).toBe(150); expect(cleanGrams(5000)).toBe(5000); expect(cleanGrams(0.5)).toBe(0.5);
    for (const bad of ['', '0', -3, 5001, 'abc', null, NaN]) expect(cleanGrams(bad)).toBeNull();
  });
});

describe('scaleFood', () => {
  const hit = { id: 1, name: 'Chicken', kcal: 120, p: 22.5, c: 0, f: 2.6 };
  it('scales per 100 g to the grams eaten', () => { expect(scaleFood(hit, 150)).toEqual({ kcal: 180, p: 33.8, c: 0, f: 3.9 }); expect(scaleFood(hit, 100)).toEqual({ kcal: 120, p: 22.5, c: 0, f: 2.6 }); });
  it('leaves out carbs and fat the food does not have', () => { expect(scaleFood({ id: 1, name: 'x', kcal: 50, p: 1 }, 30)).toEqual({ kcal: 15, p: 0.3 }); });
});

describe('labels', () => {
  it('defaults to the serving, else 100 g', () => { expect(defaultGrams({ id: 1, name: 'x', kcal: 1, p: 1, serving: 28.4 })).toBe(28.4); expect(defaultGrams({ id: 1, name: 'x', kcal: 1, p: 1 })).toBe(100); });
  it('names the food, brand and calories', () => { expect(hitLabel({ id: 1, name: 'Oats', brand: 'Acme', kcal: 380, p: 13 })).toBe('Oats (Acme) · 380 kcal per 100 g'); expect(hitLabel({ id: 1, name: 'Oats', kcal: 380, p: 13 })).toBe('Oats · 380 kcal per 100 g'); });
});
