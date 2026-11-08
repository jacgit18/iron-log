import { describe, expect, it } from 'vitest';
import type { CatalogItem, Grocery, Recipe } from '../types.ts';
import { LIBRARY_TABS, inLibraryTab, inMine, libraryHave } from './libraryRows.js';

const item = (id: string, name: string, cat: Recipe['cat'], ing: string[]): CatalogItem => ({ id, name, data: { recipe: { cat, ing, steps: ['Cook.'] } } } as unknown as CatalogItem);
const sauce = item('c:1', 'Salsa', 'sauces', ['tomato']), stew = item('c:2', 'Stew', 'protein', ['beef', 'carrot']), tea = item('c:3', 'Iced tea', 'drinks', ['tea']), cake = item('c:4', 'Cake', 'dessert', ['flour']);
const g = { items: [], stores: [] } as unknown as Grocery;
const month = { lines: {}, pulled: [] };

describe('Library tabs', () => {
  it('offers All, Meals, Ingredients and Drinks (no Foods)', () => expect(LIBRARY_TABS.map(t => t.label)).toEqual(['All', 'Meals', 'Ingredients', 'Drinks']));
  it('files a recipe by what its copy would be used as', () => {
    const ids = (tab: 'all' | 'meals' | 'ingredients' | 'drinks') => [sauce, stew, tea, cake].filter(i => inLibraryTab(i, tab)).map(i => i.id);
    expect(ids('meals')).toEqual(['c:2', 'c:4']);
    expect(ids('ingredients')).toEqual(['c:1', 'c:2']);
    expect(ids('drinks')).toEqual(['c:3']);
    expect(ids('all')).toHaveLength(4);
  });
  it('shows an item with no recipe only under All', () => {
    const none = { id: 'c:9', name: 'Oats', data: {} } as unknown as CatalogItem;
    expect(inLibraryTab(none, 'meals')).toBe(false);
    expect(inLibraryTab(none, 'all')).toBe(true);
  });
});

describe('Library at-home badge and In Mine', () => {
  it('counts the ingredients at home out of all, nothing at home reads 0 of n', () => {
    expect(libraryHave(stew, [], g, month)).toEqual({ text: '0 of 2', all: false });
  });
  it('is null for an item with no recipe', () => expect(libraryHave({ id: 'c:9', name: 'Oats', data: {} } as unknown as CatalogItem, [], g, month)).toBeNull());
  it('knows an item is already in Mine from the copy it made', () => {
    expect(inMine(stew, [{ id: 'stew', n: 'Stew', cat: 'protein', ing: [], steps: [], from: 'c:2' }])).toBe(true);
    expect(inMine(stew, [])).toBe(false);
  });
});
