import { describe, expect, it } from 'vitest';
import type { DietEntry, Recipe } from '../types.ts';
import { findFoods, kcalFromMacros, scaleFood } from './foodMacros.js';

const e = (id: string, n: string, kcal: number, p: number, from?: string, c?: number, f?: number): DietEntry => ({ id, d: '2026-10-29', n, kcal, p, ...(c !== undefined ? { c } : {}), ...(f !== undefined ? { f } : {}), ...(from ? { from } : {}) });
const r = (id: string, n: string, o: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'other', ing: [], steps: [], ...o });

describe('kcalFromMacros', () => {
  it('is 4 4 9 and rounds', () => {
    expect(kcalFromMacros(40, 51, 11)).toBe(463);
    expect(kcalFromMacros(10.5, 0, 0.5)).toBe(47);
    expect(kcalFromMacros(0, 0, 0)).toBeNull(); // 0 kcal is not a loggable amount
  });
  it('needs all three', () => {
    expect(kcalFromMacros(40, null, 11)).toBeNull();
    expect(kcalFromMacros(NaN, 1, 1)).toBeNull();
    expect(kcalFromMacros(-1, 1, 1)).toBeNull();
    expect(kcalFromMacros(999, 999, 999)).toBeNull(); // over the calorie limit
  });
});

describe('findFoods', () => {
  const entries = [e('1', 'Rice', 190, 4), e('2', 'Rice', 200, 4, undefined, 44, 0.5), e('3', 'Chili', 600, 40, 'r1'), e('4', 'Brown rice bowl', 500, 20)];
  const recipes = [r('r1', 'Chili', { kcal: 610, p: 41 }), r('r2', 'Rice pudding', { kcal: 300, p: 8, c: 50 }), r('r3', 'No numbers'), r('c:x', 'Rice salad', { kcal: 1, p: 1, from: 'c:x' })];
  it('empty query offers nothing', () => expect(findFoods(entries, recipes, '  ')).toEqual([]));
  it('starts-with first, then contains; one per name; newest log wins; library copies not offered', () => {
    expect(findFoods(entries, recipes, 'RICE').map(x => x.n)).toEqual(['Rice pudding', 'Rice', 'Brown rice bowl']);
    expect(findFoods(entries, recipes, 'rice')[1]).toEqual({ n: 'Rice', kcal: 200, p: 4, c: 44, f: 0.5 });
  });
  it('a recipe logged before is offered as the recipe', () => {
    expect(findFoods(entries, recipes, 'chi')).toEqual([{ n: 'Chili', kcal: 610, p: 41, from: 'r1' }]);
  });
  it('newest day wins even when the list is out of order', () => {
    const out = [{ ...e('2', 'Rice', 200, 4), d: '2026-10-29' }, { ...e('1', 'Rice', 190, 4), d: '2026-10-27' }];
    expect(findFoods(out, [], 'rice')).toEqual([{ n: 'Rice', kcal: 200, p: 4 }]);
  });
  it('limits', () => expect(findFoods(entries, recipes, 'r', 2)).toHaveLength(2));
});

describe('scaleFood', () => {
  it('scales and keeps what it has', () => {
    expect(scaleFood({ n: 'Chili', kcal: 600, p: 40, c: 51, f: 11, from: 'r1' }, 1.5)).toEqual({ n: 'Chili', kcal: 900, p: 60, c: 76.5, f: 16.5, from: 'r1' });
    expect(scaleFood({ n: 'Egg', kcal: 70, p: 6 }, 0.5)).toEqual({ n: 'Egg', kcal: 35, p: 3 });
  });
  it('null when out of range', () => {
    expect(scaleFood({ n: 'X', kcal: 9000, p: 1 }, 2)).toBeNull();
    expect(scaleFood({ n: 'X', kcal: 100, p: 1 }, 0)).toBeNull();
  });
});
