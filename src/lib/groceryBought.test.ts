import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem, GroceryMonth } from '../types.ts';
import { allIds, allPicked, boughtRows, storeIds } from './groceryBought.js';

const item = (id: string, store: string): GroceryItem => ({ id, n: id, store, qty: 1, cents: 100, every: true, out: false });
const g: Grocery = { stores: ['Aldi', 'Costco'], items: [item('a', 'Aldi'), item('b', 'Aldi'), item('c', 'Costco'), item('d', 'Costco')] };
const month = (lines: GroceryMonth['lines']): GroceryMonth => ({ lines, pulled: [] });

describe('boughtRows', () => {
  it('keeps only the ticked rows, in order', () => {
    expect(boughtRows(g.items, month({ d: { got: true }, b: { got: true } })).map(i => i.id)).toEqual(['b', 'd']);
  });
});

describe('select all helpers', () => {
  const groups = [{ store: 'Aldi', items: [item('a', 'Aldi'), item('b', 'Aldi')] }, { store: 'Costco', items: [item('c', 'Costco')] }];
  it('takes every row, or one store, or nothing for an unknown store', () => {
    expect(allIds(groups)).toEqual(['a', 'b', 'c']);
    expect(storeIds(groups, 'Aldi')).toEqual(['a', 'b']);
    expect(storeIds(groups, 'Nowhere')).toEqual([]);
  });
  it('says all are picked only when the list is not empty and every id is in', () => {
    expect(allPicked(['a', 'b'], new Set(['a', 'b', 'c']))).toBe(true);
    expect(allPicked(['a', 'b'], new Set(['a']))).toBe(false);
    expect(allPicked([], new Set(['a']))).toBe(false);
  });
});
