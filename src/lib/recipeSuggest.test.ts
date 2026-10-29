import { describe, expect, it } from 'vitest';
import type { GroceryItem, Recipe } from '../types.ts';
import { MAX_SUGGESTIONS, exactItem, pinFor, suggestIngredients } from './recipeSuggest.js';

const item = (id: string, n: string): GroceryItem => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
const recipe = (...ing: string[]): Recipe => ({ id: 'r', n: 'R', cat: 'other', ing: ing.map(n => ({ n })), steps: [] });

describe('suggestIngredients', () => {
  const items = [item('a', 'Chicken thighs'), item('b', 'Chicken breast'), item('c', 'Rotisserie chicken'), item('d', 'Garlic')];
  it('offers nothing for empty text', () => {
    expect(suggestIngredients('', items, [])).toEqual([]);
    expect(suggestIngredients('  ', items, [])).toEqual([]);
  });
  it('matches a word start and ranks names that start with the text first, then the shorter', () => {
    expect(suggestIngredients('chick', items, []).map(s => s.n)).toEqual(['Chicken breast', 'Chicken thighs', 'Rotisserie chicken']);
  });
  it('needs every typed word to start a word of the name, in any order', () => {
    expect(suggestIngredients('thigh chick', items, []).map(s => s.n)).toEqual(['Chicken thighs']);
    expect(suggestIngredients('hick', items, [])).toEqual([]);
  });
  it('carries the grocery item id so choosing it can pin the ingredient', () => {
    expect(suggestIngredients('garl', items, [])).toEqual([{ n: 'Garlic', home: 'd' }]);
  });
  it('adds names from your recipes, and shows a name that is in both lists once, as the grocery item', () => {
    const out = suggestIngredients('gar', items, [recipe('garlic', 'Garlic powder', 'paprika')]);
    expect(out).toEqual([{ n: 'Garlic', home: 'd' }, { n: 'Garlic powder' }]);
  });
  it('treats plurals and filler as the same name', () => {
    expect(suggestIngredients('tom', [item('t', 'Tomatoes')], [recipe('tomato', 'fresh tomatoes')])).toEqual([{ n: 'Tomatoes', home: 't' }]);
  });
  it('offers at most a handful', () => {
    const many = Array.from({ length: 20 }, (_, i) => item(`i${i}`, `Salt ${String.fromCharCode(97 + i)}`));
    expect(suggestIngredients('salt', many, [])).toHaveLength(MAX_SUGGESTIONS);
  });
  it('works with no grocery items', () => expect(suggestIngredients('pap', [], [recipe('paprika')])).toEqual([{ n: 'paprika' }]));
});

describe('exactItem', () => {
  const items = [item('a', 'Chicken  Thighs'), item('b', 'Garlic')];
  it('finds the item by its exact name, ignoring case and spacing', () => expect(exactItem(' chicken thighs ', items)?.id).toBe('a'));
  it('is null for a partial name or nothing', () => {
    expect(exactItem('chicken', items)).toBeNull();
    expect(exactItem('', items)).toBeNull();
  });
});

describe('pinFor', () => {
  const items = [item('a', 'Garlic')];
  it('pins an ingredient whose name is exactly a Groceries item', () => expect(pinFor('garlic', undefined, items)).toBe('a'));
  it('pins nothing for another name, or for a swapped ingredient', () => {
    expect(pinFor('garlic powder', undefined, items)).toBeUndefined();
    expect(pinFor('garlic', 'shallot', items)).toBeUndefined();
  });
});
