import { describe, expect, it } from 'vitest';
import { MAX_STORES, byStore, mergeGrocery, normGrocery, own, tally } from './grocery.js';
import { monthShare, payerOf } from './grocerySettle.js';
import type { Grocery, GroceryData, GroceryItem, GroceryMonth } from '../types.ts';

// Edge cases found by the 2026-10-20 code audit (money-findings M-G and M-I): a store is a free-text name, so it can be called anything, and an item can end up
// on a store that is not in the list (a store removed on another device while this one added to it, an import into a full list).
const item = (id: string, n: string, store: string, cents: number): GroceryItem => ({ id, n, store, qty: 1, cents, every: true, out: false });

describe('a store named like an Object.prototype member', () => {
  const g = normGrocery({ stores: ['constructor', 'toString', 'Aldi'], items: [item('q', 'Q', 'constructor', 200), item('w', 'W', 'toString', 300)] });
  const m: GroceryMonth = { lines: { q: { got: true }, w: { got: true } }, pulled: [], tax: { Aldi: 10 }, payer: { Aldi: 'someone' } };

  it('own() reads only a map\'s own keys', () => {
    expect(own({ Aldi: 5 }, 'Aldi')).toBe(5);
    for (const k of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) expect(own({ Aldi: 5 }, k)).toBeUndefined();
    expect(own(undefined, 'Aldi')).toBeUndefined();
  });

  it('the month\'s spent is the sum of the prices, not a function glued onto a number', () => {
    const t = tally(g.items, m);
    expect(t.spent).toBe(500); // Aldi's tax is not counted: nothing was bought at Aldi
    expect(Number.isFinite(t.spent)).toBe(true);
  });

  it('your share and what you paid are whole numbers', () => {
    const s = monthShare(g, m);
    expect(s).toEqual({ paid: 500, yours: 500 });
  });

  it('the payer of such a store is you', () => {
    expect(payerOf(g, m, 'constructor')).toBe('me');
  });

  it('its own tax is read when it has one', () => {
    const withTax: GroceryMonth = { ...m, tax: { constructor: 25 } };
    expect(tally(g.items, withTax).spent).toBe(525);
  });
});

describe('an item whose store is not in the store list', () => {
  // Built by hand, not through normGrocery (which moves such an item to Anywhere on the next load): the state between an import or a sync and that load.
  const g: Grocery = { stores: ['Aldi'], items: [item('a', 'A', 'Aldi', 100), item('q', 'Q', 'Gone', 200), item('z', 'Z', '', 300)] };

  it('is still shown, under Anywhere with the items that have no store', () => {
    const out = byStore(g, g.items);
    expect(out.flatMap(x => x.items.map(i => i.id)).sort()).toEqual(['a', 'q', 'z']);
    expect(out.find(x => x.store === '')?.items.map(i => i.id).sort()).toEqual(['q', 'z']);
    expect(out.find(x => x.store === 'Aldi')?.items.map(i => i.id)).toEqual(['a']);
  });

  it('no item is listed twice', () => {
    const ids = byStore(g, g.items).flatMap(x => x.items.map(i => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Add to my data into a full list of stores', () => {
  const full = normGrocery({ stores: Array.from({ length: MAX_STORES }, (_, n) => `Store ${n}`), items: [] });
  const inc: GroceryData = { stores: ['New store'], items: [item('n', 'Noodles', 'New store', 150)], months: {} };

  it('puts an item whose store did not fit under Anywhere, so it can be seen', () => {
    const r = mergeGrocery(full, {}, inc);
    expect(r.grocery.stores).toHaveLength(MAX_STORES);
    expect(r.grocery.items).toHaveLength(1);
    expect(r.grocery.items[0].store).toBe('');
    expect(byStore(r.grocery, r.grocery.items).flatMap(x => x.items.map(i => i.id))).toEqual(['n']);
    expect(r.changed).toBe(true);
  });

  it('keeps the store when there is room', () => {
    const roomy = normGrocery({ stores: ['Aldi'], items: [] });
    const r = mergeGrocery(roomy, {}, inc);
    expect(r.grocery.stores).toEqual(['Aldi', 'New store']);
    expect(r.grocery.items[0].store).toBe('New store');
  });
});

// Review of PR 410: importing the same file twice into a full list must not add the item twice.
describe('mergeGrocery with a store that does not fit', () => {
  it('is idempotent: the second import finds the item under Anywhere', () => {
    const cur: Grocery = { stores: Array.from({ length: MAX_STORES }, (_, k) => `S${k}`), items: [] };
    const inc: GroceryData = { stores: ['Extra'], items: [item('z1', 'Noodles', 'Extra', 100)], months: {} };
    const once = mergeGrocery(cur, {}, inc);
    const twice = mergeGrocery(once.grocery, once.months, inc);
    expect(once.grocery.items.filter(i => i.n === 'Noodles')).toHaveLength(1);
    expect(twice.grocery.items.filter(i => i.n === 'Noodles')).toHaveLength(1);
  });
});
