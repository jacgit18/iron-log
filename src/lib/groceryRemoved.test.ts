import { describe, expect, it } from 'vitest';
import { removedBoughtByStore } from './groceryRemoved.js';
import type { Grocery, GroceryMonth } from '../types.ts';

const item = (id: string, n: string, store = '') => ({ id, n, store, qty: 1, cents: 300, every: true, out: false });

describe('removedBoughtByStore (audit X-8)', () => {
  const g: Grocery = { stores: ['Aldi'], items: [item('rice', 'Rice', 'Aldi')] };
  const m: GroceryMonth = { lines: { rice: { got: true }, gone: { got: true, qty: 2, cents: 150, store: 'Aldi' }, other: { qty: 1, cents: 100 } }, pulled: [], tax: { Aldi: 20 } };
  it('counts a bought line of a removed item under the store it was bought at, with its cost', () => {
    expect(removedBoughtByStore(g, m)).toEqual({ Aldi: { count: 1, cents: 300 } });
  });
  it('ignores lines that were not bought and items that still exist', () => {
    expect(removedBoughtByStore(g, { lines: { rice: { got: true } }, pulled: [] })).toEqual({});
  });
});
