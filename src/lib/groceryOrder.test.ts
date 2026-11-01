import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem, GroceryMonth } from '../types.ts';
import { byStore, gotLast } from './grocery.js';

const item = (id: string, n: string, store: string): GroceryItem => ({ id, n, store, qty: 1, cents: null, every: true, out: false });
const g: Grocery = {
  stores: ['Aldi', 'Costco'],
  items: [item('z1', 'Zucchini', 'Aldi'), item('b2', 'butter', 'Aldi'), item('a3', 'Árbol chili', 'Aldi'), item('m1', 'Milk 10', 'Costco'), item('m2', 'Milk 2', 'Costco'), item('x', 'Apples', 'Gone'), item('s', 'salt', '')],
};
const ids = (store: string) => byStore(g, g.items).find(x => x.label === store)!.items.map(i => i.id);

describe('grocery order inside a store (display only)', () => {
  it('lists each store A to Z, ignoring case and accents', () => {
    expect(ids('Aldi')).toEqual(['a3', 'b2', 'z1']);
  });
  it('reads digits as numbers', () => {
    expect(ids('Costco')).toEqual(['m2', 'm1']);
  });
  it('sorts the Anywhere section, including items whose store was removed', () => {
    expect(ids('Anywhere')).toEqual(['x', 's']);
  });
  it('orders equal names by id, whatever order they were added in', () => {
    const twins: Grocery = { ...g, items: [item('t2', 'Tea', 'Aldi'), item('t1', 'tea', 'Aldi')] };
    expect(byStore(twins, twins.items)[0].items.map(i => i.id)).toEqual(['t1', 't2']);
  });
  it('leaves the stored list and its objects as they were', () => {
    const before = JSON.stringify(g);
    byStore(g, g.items, true);
    expect(JSON.stringify(g)).toBe(before);
    expect(g.items.map(i => i.id)).toEqual(['z1', 'b2', 'a3', 'm1', 'm2', 'x', 's']);
  });
  it('keeps unticked before ticked, each part A to Z', () => {
    const m: GroceryMonth = { lines: { a3: { got: true } }, pulled: [] };
    expect(gotLast(byStore(g, g.items)[0].items, m).map(i => i.id)).toEqual(['b2', 'z1', 'a3']);
  });
});
