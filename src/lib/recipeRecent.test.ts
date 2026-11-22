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

describe('quickPicks per section (brief foods-made-and-store-bought)', () => {
  const meal = (id: string, fav?: true): Recipe => ({ ...r(id, fav), steps: [] });
  const dish = (id: string, fav?: true): Recipe => ({ ...r(id, fav), steps: ['cook'] });
  const food = (id: string, uses: Recipe['uses'], fav?: true): Recipe => ({ id, n: id.toUpperCase(), cat: 'ready', uses, ...(fav ? { fav } : {}), ing: [], steps: [] });
  const all = [meal('m1', true), meal('m2'), dish('d1', true), dish('d2'), food('eggs', ['ready', 'ingredient'], true), food('oil', ['ingredient']), food('tea', ['drink'])];
  const diet = [e('1', '2026-09-20', 'd2'), e('2', '2026-09-21', 'm2'), e('3', '2026-09-22', 'oil'), e('4', '2026-09-23', 'tea')];
  const ids = (s?: Parameters<typeof quickPicks>[3]) => quickPicks(all, diet, [], s).map(p => p.recipe.id);
  it('lists only the section\'s items: starred first, then recent', () => {
    expect(ids('meals')).toEqual(['m1', 'm2']);
    expect(ids('recipes')).toEqual(['d1', 'd2']);
    expect(ids('drinks')).toEqual(['tea']);
  });
  it('shows a two-use food in each of its sections', () => {
    expect(ids('ready')).toEqual(['eggs']);
    expect(ids('ingredients')).toEqual(['eggs', 'oil']);
  });
  it('never mixes sections, has none for Library, and with no section behaves as before', () => {
    expect(ids('library')).toEqual([]);
    expect(ids()).toEqual(quickPicks(all, diet, []).map(p => p.recipe.id));
    expect(ids()).toEqual(expect.arrayContaining(['m1', 'd1', 'eggs', 'm2', 'd2', 'oil', 'tea']));
    expect(ids('meals')).not.toContain('d2');
  });
  it('stops at the cap inside a section', () => {
    const many = Array.from({ length: 12 }, (_, i) => meal(`x${i}`, true));
    expect(quickPicks(many, [], [], 'meals')).toHaveLength(MAX_QUICK);
  });
});
