import { describe, expect, it } from 'vitest';
import type { GroceryItem, Recipe } from '../types.ts';
import { MAX_SUGGESTIONS, exactItem, filterSauces, linkedRecipe, pinFor, refreshLink, sauceCandidates, sauceFor, suggestIngredients } from './recipeSuggest.js';

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

describe('sauces and seasonings as ingredients', () => {
  const r = (id: string, n: string, cat: Recipe['cat']): Recipe => ({ id, n, cat, ing: [{ n: 'x' }], steps: [] });
  const all = [r('p', 'Pulled pork', 'protein'), r('t', 'Taco seasoning', 'seasonings'), r('b', 'bbq sauce', 'sauces'), r('a', 'Aioli', 'sauces'), r('l', 'Garlic dip', 'sauces'), r('d', 'Dessert sauce', 'dessert')];

  it('lists only your Sauces and Seasonings, A to Z, never the recipe being edited', () => {
    expect(sauceCandidates(all).map(s => s.n)).toEqual(['Aioli', 'bbq sauce', 'Garlic dip', 'Taco seasoning']);
    expect(sauceCandidates(all, 'a').map(s => s.n)).toEqual(['bbq sauce', 'Garlic dip', 'Taco seasoning']);
    expect(sauceCandidates([])).toEqual([]);
  });
  it('breaks a name tie by id so the order is steady', () => {
    expect(sauceCandidates([r('2', 'Salsa', 'sauces'), r('1', 'salsa', 'sauces')]).map(s => s.id)).toEqual(['1', '2']);
  });
  it('filters the picker by word starts', () => {
    const list = sauceCandidates(all);
    expect(filterSauces(list, '').map(s => s.n)).toHaveLength(4);
    expect(filterSauces(list, 'seas').map(s => s.n)).toEqual(['Taco seasoning']);
    expect(filterSauces(list, 'dip gar').map(s => s.n)).toEqual(['Garlic dip']);
    expect(filterSauces(list, 'zzz')).toEqual([]);
  });
  it('links an ingredient whose name is exactly a sauce, ignoring case and spacing; a partial name links nothing', () => {
    const list = sauceCandidates(all);
    expect(sauceFor(' taco  SEASONING ', list)?.id).toBe('t');
    expect(sauceFor('taco', list)).toBeUndefined();
    expect(sauceFor('', list)).toBeUndefined();
    expect(sauceFor('Pulled pork', list)).toBeUndefined(); // not a sauce or seasoning
  });
  it('offers matching sauces first, tagged, and shows a name they share with a Groceries item once', () => {
    const items = [item('g', 'Taco shells'), item('h', 'Taco seasoning'), item('i', 'Tacos al pastor spice')];
    const out = suggestIngredients('taco', items, [], sauceCandidates(all));
    expect(out[0]).toEqual({ n: 'Taco seasoning', tag: 'Seasoning' });
    expect(out.filter(s => s.n === 'Taco seasoning')).toHaveLength(1);
    expect(out.map(s => s.n)).toContain('Taco shells');
    expect(suggestIngredients('bbq', [], [], sauceCandidates(all))).toEqual([{ n: 'bbq sauce', tag: 'Sauce' }]);
    expect(suggestIngredients('bbq', [], [])).toEqual([]); // unchanged without sauces
  });
  it('resolves a link by id: a renamed sauce shows its new name, a deleted one and a self-link give nothing', () => {
    const line = { n: 'Old name', rid: 't' };
    expect(linkedRecipe(line, [{ ...all[1]!, n: 'Taco mix' }])?.n).toBe('Taco mix');
    expect(linkedRecipe(line, all.filter(s => s.id !== 't'))).toBeUndefined();
    expect(linkedRecipe(line, all, 't')).toBeUndefined();
    expect(linkedRecipe({ n: 'Salt' }, all)).toBeUndefined();
  });
  it('keeps the link of a sauce moved to another category (it resolves by id)', () => {
    expect(linkedRecipe({ n: 'Taco seasoning', rid: 't' }, [{ ...all[1]!, cat: 'other' }])?.id).toBe('t');
  });
  it('refreshes a line for the form: new name when renamed, plain text when the sauce is gone', () => {
    expect(refreshLink({ n: 'Old', amt: '1', rid: 't' }, [{ ...all[1]!, n: 'Taco mix' }])).toEqual({ n: 'Taco mix', amt: '1', rid: 't' });
    expect(refreshLink({ n: 'Old', amt: '1', rid: 'gone' }, all)).toEqual({ n: 'Old', amt: '1' });
    const plain = { n: 'Salt' };
    expect(refreshLink(plain, all)).toBe(plain);
  });
});
