import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { filterRecipes, recipeMeta, sameName, stepsFromText } from './recipeList.js';

const r = (id: string, n: string, cat: Recipe['cat'], ing: string[]): Recipe => ({ id, n, cat, ing: ing.map(x => ({ n: x })), steps: ['Cook.'] });
const list = [r('b', 'Taco seasoning', 'seasonings', ['chili powder', 'cumin']), r('a', 'Garlic chicken', 'protein', ['chicken thighs', 'garlic']), r('c', 'Chimichurri', 'sauces', ['parsley', 'garlic'])];
const none = new Set<string>();

describe('filterRecipes with a swapped ingredient', () => {
  const swapped: Recipe = { id: 's', n: 'Chimichurri', cat: 'sauces', ing: [{ n: 'white wine vinegar', sub: 'apple cider vinegar' }], steps: ['Mix.'] };
  const f = (q: string) => filterRecipes([swapped], { q, cat: null, canMake: false }, new Set()).length;
  it('finds a recipe by the name in the recipe and by the swap', () => { expect(f('wine')).toBe(1); expect(f('cider')).toBe(1); expect(f('rice')).toBe(0); });
});

describe('filterRecipes', () => {
  it('sorts by name and keeps all with no filter', () => expect(filterRecipes(list, { q: '', cat: null, canMake: false }, none).map(x => x.id)).toEqual(['c', 'a', 'b']));
  it('finds words at the start of a word in the name or an ingredient', () => {
    expect(filterRecipes(list, { q: 'garl', cat: null, canMake: false }, none).map(x => x.id)).toEqual(['c', 'a']);
    expect(filterRecipes(list, { q: 'chicken garlic', cat: null, canMake: false }, none).map(x => x.id)).toEqual(['a']);
    expect(filterRecipes(list, { q: 'icken', cat: null, canMake: false }, none)).toEqual([]);
  });
  it('narrows by category and by what can be made', () => {
    expect(filterRecipes(list, { q: '', cat: 'sauces', canMake: false }, none).map(x => x.id)).toEqual(['c']);
    expect(filterRecipes(list, { q: '', cat: null, canMake: true }, new Set(['b'])).map(x => x.id)).toEqual(['b']);
  });
});

describe('filterRecipes by tags', () => {
  const t = (id: string, cat: Recipe['cat'], tags: string[]): Recipe => ({ ...r(id, id, cat, ['x']), ...(tags.length ? { tags } : {}) });
  const tagged = [t('a', 'protein', ['Weeknight', 'Meal prep']), t('b', 'protein', ['weeknight']), t('c', 'sides', ['Weeknight', 'Meal prep']), t('d', 'sides', [])];
  const ids = (cat: Recipe['cat'] | null, tags: string[]) => filterRecipes(tagged, { q: '', cat, canMake: false, tags }, none).map(x => x.id);
  it('keeps every recipe with no tag selected', () => expect(ids(null, [])).toEqual(['a', 'b', 'c', 'd']));
  it('needs every selected tag, in any case', () => { expect(ids(null, ['weeknight'])).toEqual(['a', 'b', 'c']); expect(ids(null, ['WEEKNIGHT', 'meal prep'])).toEqual(['a', 'c']); });
  it('combines the category with the tags by AND', () => { expect(ids('protein', ['weeknight'])).toEqual(['a', 'b']); expect(ids('sides', ['weeknight', 'meal prep'])).toEqual(['c']); expect(ids('sauces', ['weeknight'])).toEqual([]); });
});

describe('recipeMeta, stepsFromText, sameName', () => {
  it('writes the meta line', () => {
    expect(recipeMeta('Sauces', 4, 25)).toBe('Sauces · 4 servings · 25 min');
    expect(recipeMeta('Protein', 1, 90)).toBe('Protein · 1 serving · 1 h 30 min');
    expect(recipeMeta('Other')).toBe('Other');
  });
  it('splits steps by line', () => expect(stepsFromText('Mix.\n\n  Bake. \n')).toEqual(['Mix.', 'Bake.']));
  it('spots a repeated name', () => {
    expect(sameName(list, 'garlic chickens')).toBe(true);
    expect(sameName(list, 'Garlic chicken', 'a')).toBe(false);
  });
  it('counts two names for one ingredient as the same recipe name (synonyms are folded)', () => {
    expect(sameName([r('e', 'Eggplant parmesan', 'protein', ['eggplant'])], 'Aubergine parmesan')).toBe(true);
    expect(sameName([r('e', 'Eggplant parmesan', 'protein', ['eggplant'])], 'Zucchini parmesan')).toBe(false);
  });
});
