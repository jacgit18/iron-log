import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { HIGH_PROTEIN_G, NUTRITION_FILTERS, UNDER_KCAL, matchesNutrition, nutritionBadge } from './recipeNutrition.js';
import { filterRecipes } from './recipeList.js';

describe('nutritionBadge', () => {
  it('shows calories and protein per serving', () => expect(nutritionBadge({ kcal: 420, p: 32 })).toBe('420 kcal · 32 g protein'));
  it('shows only the part a recipe has', () => {
    expect(nutritionBadge({ kcal: 420 })).toBe('420 kcal');
    expect(nutritionBadge({ p: 12.5 })).toBe('12.5 g protein');
  });
  it('shows protein 0 (a real number) but nothing for a recipe with neither', () => {
    expect(nutritionBadge({ kcal: 90, p: 0 })).toBe('90 kcal · 0 g protein');
    expect(nutritionBadge({})).toBeNull();
  });
  it('rounds calories and ignores a value that is not a number', () => {
    expect(nutritionBadge({ kcal: 419.6, p: 31.04 })).toBe('420 kcal · 31 g protein');
    expect(nutritionBadge({ kcal: NaN, p: '9' as unknown as number })).toBeNull();
  });
});

describe('the fixed filters', () => {
  it('have the agreed labels and thresholds', () => {
    expect(NUTRITION_FILTERS.map(f => f.label)).toEqual(['High protein', 'Under 500 kcal']);
    expect([HIGH_PROTEIN_G, UNDER_KCAL]).toEqual([30, 500]);
  });
  it('High protein is 30 g or more, Under 500 kcal is strictly under', () => {
    expect(matchesNutrition({ p: 30 }, ['protein'])).toBe(true);
    expect(matchesNutrition({ p: 29.9 }, ['protein'])).toBe(false);
    expect(matchesNutrition({ kcal: 499 }, ['kcal'])).toBe(true);
    expect(matchesNutrition({ kcal: 500 }, ['kcal'])).toBe(false);
  });
  it('never match a recipe without the number, and do not error', () => {
    expect(matchesNutrition({}, ['protein'])).toBe(false);
    expect(matchesNutrition({ kcal: 300 }, ['protein'])).toBe(false);
    expect(matchesNutrition({ p: 40 }, ['kcal'])).toBe(false);
  });
  it('combine by AND, and none selected matches everything', () => {
    expect(matchesNutrition({ kcal: 450, p: 35 }, ['protein', 'kcal'])).toBe(true);
    expect(matchesNutrition({ kcal: 650, p: 35 }, ['protein', 'kcal'])).toBe(false);
    expect(matchesNutrition({}, [])).toBe(true);
  });
});

describe('filterRecipes with nutrition, category and tags', () => {
  const m = (id: string, cat: Recipe['cat'], extra: Partial<Recipe>): Recipe => ({ id, n: id, cat, ing: [{ n: 'x' }], steps: [], ...extra });
  const list = [
    m('a', 'protein', { kcal: 450, p: 35, tags: ['Dinner'] }),
    m('b', 'protein', { kcal: 700, p: 50, tags: ['Dinner'] }),
    m('c', 'sides', { kcal: 300, p: 5 }),
    m('d', 'protein', { tags: ['Dinner'] }),
  ];
  const ids = (nutrition: Parameters<typeof matchesNutrition>[1], cat: Recipe['cat'] | null = null, tags: string[] = []) =>
    filterRecipes(list, { q: '', cat, canMake: false, tags, nutrition }, new Set()).map(r => r.id);
  it('applies one chip', () => { expect(ids(['protein'])).toEqual(['a', 'b']); expect(ids(['kcal'])).toEqual(['a', 'c']); });
  it('applies both chips together', () => expect(ids(['protein', 'kcal'])).toEqual(['a']));
  it('adds the category and the tags (AND)', () => {
    expect(ids(['kcal'], 'protein')).toEqual(['a']);
    expect(ids(['protein'], 'protein', ['dinner'])).toEqual(['a', 'b']);
    expect(ids(['kcal'], 'sides', ['dinner'])).toEqual([]);
  });
  it('leaves a recipe without numbers out, and lists it when no chip is on', () => {
    expect(ids(['protein'])).not.toContain('d');
    expect(ids([])).toContain('d');
  });
});
