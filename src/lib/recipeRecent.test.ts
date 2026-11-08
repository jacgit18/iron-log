import { describe, expect, it } from 'vitest';
import type { DietEntry, Recipe } from '../types.ts';
import { MAX_QUICK, quickPicks, recentIds } from './recipeRecent.js';

const r = (id: string, fav?: true): Recipe => ({ id, n: id.toUpperCase(), cat: 'protein', ...(fav ? { fav } : {}), ing: [], steps: [] });
const e = (id: string, d: string, from?: string): DietEntry => ({ id, d, n: 'x', kcal: 1, p: 1, ...(from ? { from } : {}) });
const recipes = [r('a'), r('b', true), r('c'), r('d')];

describe('recentIds', () => {
  it('lists what was opened (newest first), then what was logged (newest day first), once each', () => {
    expect(recentIds(recipes, [e('1', '2026-09-20', 'a'), e('2', '2026-09-22', 'c')], ['d'])).toEqual(['d', 'c', 'a']);
    expect(recentIds(recipes, [e('1', '2026-09-20', 'a')], ['a', 'd'])).toEqual(['d', 'a']);
  });
  it('ignores entries that are not from a recipe and recipes that are gone', () => expect(recentIds(recipes, [e('1', '2026-09-20'), e('2', '2026-09-20', 'zzz')], ['gone'])).toEqual([]));
  it('is empty with nothing opened or logged', () => expect(recentIds(recipes, [], [])).toEqual([]));
});

describe('quickPicks', () => {
  it('puts starred recipes first, then recent ones that are not starred', () => {
    expect(quickPicks(recipes, [e('1', '2026-09-20', 'b'), e('2', '2026-09-21', 'a')], []).map(p => [p.recipe.id, p.fav])).toEqual([['b', true], ['a', false]]);
  });
  it('is empty with no stars and nothing recent (the row is hidden)', () => expect(quickPicks([r('a')], [], [])).toEqual([]));
  it(`stops at ${MAX_QUICK}`, () => {
    const many = Array.from({ length: 12 }, (_, i) => r(`r${i}`, true));
    expect(quickPicks(many, [], [])).toHaveLength(MAX_QUICK);
  });
});
