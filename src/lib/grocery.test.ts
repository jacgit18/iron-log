import { describe, it, expect } from 'vitest';
import {
  SUGGESTED_STORES, storeChoices, byStore, centsText, emptyMonth, lineOf, lineTotal, mergeGrocery, money, monthKey, newGroceryId, normGrocery, normGroceryData, normGroceryMonth, occasional, onList, parseDollars, shiftMonth, tally,
} from './grocery.js';
import type { Grocery, GroceryMonth } from '../types.ts';

const g: Grocery = {
  stores: ['Veg market', 'Costco'],
  items: [
    { id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, once: false },
    { id: 'rice', n: 'Rice', store: 'Costco', qty: 1, cents: 1899, once: false },
    { id: 'salt', n: 'Salt', store: '', qty: 1, cents: null, once: false },
    { id: 'saffron', n: 'Saffron', store: 'Costco', qty: 1, cents: 1200, once: true },
  ],
};

describe('months', () => {
  it('keys and steps across a year end', () => {
    expect(monthKey(new Date(2026, 9, 31))).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-03', -14)).toBe('2025-01');
  });
});

describe('money', () => {
  it('reads dollars into whole cents and refuses anything else', () => {
    expect(parseDollars('3.49')).toBe(349);
    expect(parseDollars('$3.5')).toBe(350);
    expect(parseDollars('4')).toBe(400);
    expect(parseDollars('0.1')).toBe(10);
    for (const bad of ['', 'abc', '-1', '1.234', '1,50', '1e3', '9999999']) expect(parseDollars(bad)).toBeNull();
  });
  it('totals without float drift', () => {
    expect(lineTotal(3, 10)).toBe(30);
    expect(lineTotal(0.1 * 3 * 10, 10)).toBe(30); // 3.0000000000000004 x 10 cents
    expect(lineTotal(2.5, 399)).toBe(998);
    expect(lineTotal(3, null)).toBe(0);
    expect(money(1899)).toContain('18.99');
    expect(centsText(250)).toBe('2.50');
    expect(centsText(null)).toBe('');
  });
});

describe('a fresh month', () => {
  it('is every regular item, nothing ticked, with the catalogue count and price', () => {
    const m = emptyMonth();
    expect(onList(g, m).map(i => i.id)).toEqual(['kale', 'rice', 'salt']);
    expect(occasional(g, m).map(i => i.id)).toEqual(['saffron']);
    expect(lineOf(g.items[0], m)).toEqual({ got: false, qty: 2, cents: 250 });
  });
  it('shows an occasional item once it is pulled on, and that month only', () => {
    const m: GroceryMonth = { lines: {}, pulled: ['saffron'] };
    expect(onList(g, m).map(i => i.id)).toEqual(['kale', 'rice', 'salt', 'saffron']);
    expect(occasional(g, m)).toEqual([]);
    expect(onList(g, emptyMonth()).map(i => i.id)).not.toContain('saffron');
  });
  it('uses the month’s own count and price over the catalogue’s', () => {
    const m: GroceryMonth = { lines: { kale: { got: true, qty: 4, cents: 300 } }, pulled: [] };
    expect(lineOf(g.items[0], m)).toEqual({ got: true, qty: 4, cents: 300 });
  });
});

describe('groups and totals', () => {
  it('groups by store in the stores’ order, no-store last, leaving empty stores out', () => {
    expect(byStore(g, onList(g, emptyMonth())).map(x => [x.label, x.items.map(i => i.id)])).toEqual([['Veg market', ['kale']], ['Costco', ['rice']], ['Anywhere', ['salt']]]);
    expect(byStore({ ...g, stores: ['Veg market', 'Costco', 'Empty'] }, [g.items[0]]).map(x => x.label)).toEqual(['Veg market']);
  });
  it('splits expected from spent and counts the unpriced', () => {
    const m: GroceryMonth = { lines: { kale: { got: true, qty: 4, cents: 300 } }, pulled: [] };
    expect(tally(onList(g, m), m)).toEqual({ count: 3, got: 1, planned: 1200 + 1899, spent: 1200, unpriced: 1 });
    expect(tally([], emptyMonth())).toEqual({ count: 0, got: 0, planned: 0, spent: 0, unpriced: 0 });
  });
});

describe('cleaning saved or imported data', () => {
  it('drops bad items, repeated ids and junk, and fills a store list from the items', () => {
    const c = normGrocery({
      stores: ['A', 'A', '', 5],
      items: [{ id: 'x', n: ' Egg ', store: 'B', qty: '3', cents: 199.5, once: 'yes' }, { id: 'x', n: 'Dup' }, { n: 'no id' }, { id: 'y', n: '' }, null, 7,
        { id: '__proto__', n: 'bad' }, { id: 'z', n: 'Z', store: 'A', qty: -2, cents: -5, once: true }],
    });
    expect(c.items).toEqual([
      { id: 'x', n: 'Egg', store: 'B', qty: 3, cents: null, once: false },
      { id: 'z', n: 'Z', store: 'A', qty: 1, cents: null, once: true },
    ]);
    expect(c.stores).toEqual(['A', 'B']);
  });
  it('treats anything that is not a document as an empty list', () => {
    for (const bad of [null, undefined, 5, 'x', [], { items: 'no' }]) expect(normGrocery(bad)).toEqual({ stores: [], items: [] });
    for (const bad of [null, 5, 'x', [], { lines: 'no' }]) expect(normGroceryMonth(bad)).toEqual({ lines: {}, pulled: [] });
  });
  it('keeps only valid lines and pulled ids', () => {
    expect(normGroceryMonth({ lines: { a: { got: true, qty: 2, cents: 100, extra: 1 }, b: { got: false }, c: 'x', __proto__: { got: true } }, pulled: ['a', 'a', 3, ''] }))
      .toEqual({ lines: { a: { got: true, qty: 2, cents: 100 } }, pulled: ['a'] });
  });
});

describe('ids', () => {
  it('makes a readable id and avoids a taken one', () => {
    expect(newGroceryId([], 'Baby Spinach!')).toBe('baby-spinach');
    expect(newGroceryId(g.items, 'Kale')).toBe('kale-2');
    expect(newGroceryId([], '???')).toBe('item');
  });
});

describe('the data file part', () => {
  it('is null when there is nothing, and cleans what there is', () => {
    expect(normGroceryData(null)).toBeNull();
    expect(normGroceryData({ items: [], months: { '2026-01': { lines: {}, pulled: [] } } })).toBeNull();
    const d = normGroceryData({ items: [{ id: 'a', n: 'A' }], months: { '2026-01': { lines: { a: { got: true } } }, bad: { lines: { a: { got: true } } }, '2026-13': {} } });
    expect(d?.items).toHaveLength(1);
    expect(Object.keys(d?.months || {})).toEqual(['2026-01']);
  });
  it('merges by adding what is missing and keeping what is here', () => {
    const inc = normGroceryData({
      stores: ['Costco', 'Giant'],
      items: [{ id: 'kale', n: 'Kale', store: 'Veg market', qty: 9 }, { id: 'oats', n: 'Oats', store: 'Giant', qty: 1 }, { id: 'kale2', n: 'KALE', store: 'Veg market', qty: 1 }],
      months: { '2026-01': { lines: { kale: { got: true }, rice: { got: true, qty: 3 } }, pulled: ['saffron'] }, '2026-02': { lines: { rice: { got: true } }, pulled: [] } },
    })!;
    const here = { '2026-01': { lines: { rice: { qty: 5 } }, pulled: [] as string[] } };
    const r = mergeGrocery(g, here, inc);
    expect(r.changed).toBe(true);
    expect(r.grocery.items.map(i => i.id)).toEqual(['kale', 'rice', 'salt', 'saffron', 'oats']); // kale stays as it is here; the same name in the same store is not added twice
    expect(r.grocery.items[0].qty).toBe(2);
    expect(r.grocery.stores).toEqual(['Veg market', 'Costco', 'Giant']);
    expect(r.months['2026-01']).toEqual({ lines: { kale: { got: true }, rice: { qty: 5 } }, pulled: ['saffron'] }); // a line that is here stays whole; a line only the file has is added
    expect(r.months['2026-02'].lines.rice.got).toBe(true);
    expect(mergeGrocery(g, {}, { ...g, months: {} }).changed).toBe(false);
  });
});

describe('store choices', () => {
  it('lists your stores, then the suggested ones you have not used (any case)', () => {
    const c = storeChoices({ stores: ['Costco', 'aldi'], items: [] });
    expect(c.mine).toEqual(['Costco', 'aldi']);
    expect(c.suggested).toEqual(["BJ's", 'C-Town', 'Whole Foods', 'Flatbush Co-Op']);
    expect(storeChoices({ stores: [], items: [] }).suggested).toEqual(SUGGESTED_STORES);
  });
});
