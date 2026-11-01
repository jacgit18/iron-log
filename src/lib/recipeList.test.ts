import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { DEFAULT_RECIPE_SORT, LIBRARY_SORTS, RECIPE_SORTS, filterRecipes, librarySortedBy, recipeMeta, sameName, sortRecipes, stepsFromText } from './recipeList.js';

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

describe('sortRecipes', () => {
  const m = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ ...r(id, n, 'protein', ['x']), ...extra });
  const all = [m('b', 'beta', { minutes: 30, kcal: 400 }), m('a', 'Alpha', { minutes: 10 }), m('c', 'Éclair', { kcal: 200 }), m('d', 'alpha', { minutes: 30, kcal: 400 })];
  const ids = (sort: Parameters<typeof sortRecipes>[1], make: string[] = []) => sortRecipes(all, sort, all, new Set(make)).map(x => x.id);
  it('defaults to name, ignoring case, ties by id', () => { expect(DEFAULT_RECIPE_SORT).toBe(RECIPE_SORTS[0].key); expect(ids('name')).toEqual(['a', 'd', 'b', 'c']); });
  it('puts the last added first', () => expect(ids('newest')).toEqual(['d', 'c', 'a', 'b']));
  it('sorts by time with unknown last and ties by name', () => expect(ids('time')).toEqual(['a', 'd', 'b', 'c']));
  it('sorts by calories with unknown last and ties by name', () => expect(ids('kcal')).toEqual(['c', 'd', 'b', 'a']));
  it('puts recipes you can make first, then the rest by name', () => expect(ids('canmake', ['b', 'c'])).toEqual(['b', 'c', 'a', 'd']));
  it('does not change the list it was given', () => { const copy = [...all]; sortRecipes(all, 'time', all, new Set()); expect(all).toEqual(copy); });
  it('sorts a filtered subset by the full list order', () => expect(sortRecipes([all[0]!, all[2]!], 'newest', all, new Set()).map(x => x.id)).toEqual(['c', 'b']));
});

describe('the library sort label', () => {
  it('says name when sorted by name or when nothing is typed, best match otherwise', () => {
    expect(LIBRARY_SORTS.map(o => o.key)).toEqual(['relevance', 'name']);
    expect(librarySortedBy('relevance', '')).toBe('Sorted by name, A to Z');
    expect(librarySortedBy('relevance', 'bread')).toBe('Sorted by best match');
    expect(librarySortedBy('relevance', '!! ')).toBe('Sorted by name, A to Z'); // punctuation only: the server has no words
    expect(librarySortedBy('name', 'bread')).toBe('Sorted by name, A to Z');
  });
});
