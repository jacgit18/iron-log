import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { filterRecipes, recipeMeta, sameName, stepsFromText } from './recipeList.js';

const r = (id: string, n: string, cat: Recipe['cat'], ing: string[]): Recipe => ({ id, n, cat, ing: ing.map(x => ({ n: x })), steps: ['Cook.'] });
const list = [r('b', 'Taco seasoning', 'seasonings', ['chili powder', 'cumin']), r('a', 'Garlic chicken', 'protein', ['chicken thighs', 'garlic']), r('c', 'Chimichurri', 'sauces', ['parsley', 'garlic'])];
const none = new Set<string>();

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
});
