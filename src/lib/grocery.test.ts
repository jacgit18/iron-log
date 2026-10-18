import { describe, it, expect } from 'vitest';
import {
  SUGGESTED_STORES, storeChoices, byStore, centsText, emptyMonth, lineOf, lineTotal, mergeGrocery, money, monthKey, newGroceryId, normGrocery, normGroceryData, normGroceryMonth, gotLast, haveOf, onList, parseDollars, shiftMonth, spendByMonth, tally,
} from './grocery.js';
import type { Grocery, GroceryMonth } from '../types.ts';

const g: Grocery = {
  stores: ['Veg market', 'Costco'],
  items: [
    { id: 'kale', n: 'Kale', store: 'Veg market', qty: 2, cents: 250, every: true, out: false },
    { id: 'rice', n: 'Rice', store: 'Costco', qty: 1, cents: 1899, every: true, out: false },
    { id: 'salt', n: 'Salt', store: '', qty: 1, cents: null, every: true, out: false },
    { id: 'saffron', n: 'Saffron', store: 'Costco', qty: 1, cents: 1200, every: false, out: false },
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
  it('is every item, nothing ticked, with the catalogue count and price', () => {
    const m = emptyMonth();
    expect(onList(g, m, true).map(i => i.id)).toEqual(['kale', 'rice', 'salt', 'saffron']);
    expect(lineOf(g.items[0], m)).toEqual({ got: false, have: false, qty: 2, cents: 250 });
  });
  it('takes an item off this month’s list once you have it, and a purchase counts as having it', () => {
    const m: GroceryMonth = { lines: { kale: { have: true }, rice: { got: true } }, pulled: [] };
    expect(onList(g, m, true).map(i => i.id)).toEqual(['rice', 'salt', 'saffron']); // kale is had; rice is bought and listed as bought
    expect(haveOf(g.items[0], m)).toBe(true);
    expect(haveOf(g.items[1], m)).toBe(true);
    expect(haveOf(g.items[2], m)).toBe(false);
  });
  it('starts the next month with every item back on the list: a tick belongs to its month', () => {
    const last: GroceryMonth = { lines: { kale: { have: true }, salt: { have: true } }, pulled: [] };
    expect(onList(g, last, true).map(i => i.id)).toEqual(['rice', 'saffron']);
    expect(onList(g, emptyMonth(), true).map(i => i.id)).toEqual(['kale', 'rice', 'salt', 'saffron']);
  });
  it('shows a past month as what was bought then: a ticked item, or one with its own count or price', () => {
    const m: GroceryMonth = { lines: { saffron: { got: true }, kale: { qty: 2 }, rice: { have: true } }, pulled: [] };
    expect(onList(g, m, false).map(i => i.id)).toEqual(['kale', 'saffron']); // a "have" tick alone is not a purchase
    expect(onList(g, emptyMonth(), false)).toEqual([]);
  });
  it('still shows an item an older version pulled onto a past month', () => {
    const m: GroceryMonth = { lines: {}, pulled: ['saffron'] };
    expect(onList(g, m, false).map(i => i.id)).toEqual(['saffron']);
  });
  it('uses the month’s own count and price over the catalogue’s', () => {
    const m: GroceryMonth = { lines: { kale: { got: true, qty: 4, cents: 300 } }, pulled: [] };
    expect(lineOf(g.items[0], m)).toEqual({ got: true, have: false, qty: 4, cents: 300 });
  });
  it('puts ticked items after the ones still to get, keeping catalogue order in each part', () => {
    const m: GroceryMonth = { lines: { kale: { got: true }, salt: { got: true } }, pulled: [] };
    expect(gotLast(g.items, m).map(i => i.id)).toEqual(['rice', 'saffron', 'kale', 'salt']);
  });
});

describe('groups and totals', () => {
  it('groups by store in the stores’ order, no-store last, leaving empty stores out', () => {
    expect(byStore(g, onList(g, emptyMonth(), true)).map(x => [x.label, x.items.map(i => i.id)])).toEqual([['Veg market', ['kale']], ['Costco', ['rice', 'saffron']], ['Anywhere', ['salt']]]);
    expect(byStore({ ...g, stores: ['Veg market', 'Costco', 'Empty'] }, [g.items[0]]).map(x => x.label)).toEqual(['Veg market']);
  });
  it('splits expected from spent and counts the unpriced', () => {
    const m: GroceryMonth = { lines: { kale: { got: true, qty: 4, cents: 300 } }, pulled: [] };
    expect(tally(onList(g, m, true), m)).toEqual({ count: 4, got: 1, planned: 1200 + 1899 + 1200, spent: 1200, unpriced: 1 });
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
      { id: 'x', n: 'Egg', store: 'B', qty: 3, cents: null, every: true, out: false },
      { id: 'z', n: 'Z', store: 'A', qty: 1, cents: null, every: false, out: false },
    ]);
    expect(c.stores).toEqual(['A', 'B']);
  });
  it('reads Every month and When out, and turns an older occasional item into a When-out item that is not out', () => {
    const c = normGrocery({ items: [
      { id: 'a', n: 'A' }, // older regular item
      { id: 'b', n: 'B', once: true }, // older occasional item
      { id: 'c', n: 'C', every: false, out: true },
      { id: 'd', n: 'D', every: false, out: 'yes' },
      { id: 'e', n: 'E', every: true, out: true }, // an Every-month item is never out
      { id: 'f', n: 'F', every: false, once: false },
    ] });
    expect(c.items.map(i => [i.id, i.every, i.out])).toEqual([['a', true, false], ['b', false, false], ['c', false, true], ['d', false, false], ['e', true, false], ['f', false, false]]);
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
      months: { '2026-01': { lines: { kale: { got: true }, rice: { got: true, qty: 3 } }, pulled: ['saffron'] }, '2026-02': { lines: { oats: { got: true } }, pulled: [] } },
    })!;
    const here = { '2026-01': { lines: { rice: { qty: 5 } }, pulled: [] as string[] } };
    const r = mergeGrocery(g, here, inc);
    expect(r.changed).toBe(true);
    expect(r.grocery.items.map(i => i.id)).toEqual(['kale', 'rice', 'salt', 'saffron', 'oats']); // kale stays as it is here; the same name in the same store is not added twice
    expect(r.grocery.items[0].qty).toBe(2);
    expect(r.grocery.stores).toEqual(['Veg market', 'Costco', 'Giant']);
    // the file's rice line is for an item its own catalogue does not list, so it is dropped; the saffron pull has no saffron in the file either
    expect(r.months['2026-01']).toEqual({ lines: { kale: { got: true }, rice: { qty: 5 } }, pulled: [] });
    expect(r.months['2026-02'].lines.oats.got).toBe(true);
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

describe('merging when two devices made different ids', () => {
  const item = (id: string, n: string, store = 'Costco') => ({ id, n, store, qty: 1, cents: null, every: true, out: false });
  it('sends a file’s month lines to the matching item here, even under another id, and to a new id when its own is taken', () => {
    // here: "milk" is Giant's milk; in the file "milk" is Costco's milk and "milk-2" is Giant's
    const here = { stores: ['Giant'], items: [item('milk', 'Milk', 'Giant')] };
    const inc = normGroceryData({
      stores: ['Costco', 'Giant'],
      items: [item('milk', 'Milk', 'Costco'), item('milk-2', 'Milk', 'Giant')],
      months: { '2026-03': { lines: { milk: { got: true, cents: 400 }, 'milk-2': { got: true, cents: 500 } }, pulled: [] } },
    })!;
    const r = mergeGrocery(here, {}, inc);
    expect(r.grocery.items.map(i => [i.id, i.store])).toEqual([['milk', 'Giant'], ['milk-2', 'Costco']]); // Costco's milk got a new id
    expect(r.months['2026-03'].lines).toEqual({ 'milk-2': { got: true, cents: 400 }, milk: { got: true, cents: 500 } }); // each tick is on its own item
  });
  it('drops lines for items it could not add and for ids the file does not list', () => {
    const full = { stores: [], items: Array.from({ length: 500 }, (_, i) => item(`i${i}`, `Item ${i}`, '')) };
    const inc = normGroceryData({ items: [item('new', 'New thing', '')], months: { '2026-03': { lines: { new: { got: true }, ghost: { got: true } }, pulled: ['ghost'] } } })!;
    const r = mergeGrocery(full, {}, inc);
    expect(r.grocery.items).toHaveLength(500);
    expect(r.months).toEqual({});
    expect(r.changed).toBe(false);
  });
});

describe('spending by month', () => {
  const months: Record<string, GroceryMonth> = {
    '2026-08': { lines: { kale: { got: true }, rice: { got: true, qty: 2, cents: 1000 }, salt: { got: true } }, pulled: [] },
    '2026-09': { lines: { kale: { qty: 3 } }, pulled: [] }, // counted but not ticked: not bought
    '2026-10': { lines: { gone: { got: true, qty: 2, cents: 300 }, kale: { got: true, cents: 400 } }, pulled: [] },
  };
  it('adds up only ticked lines, oldest month first, with the month\'s own price before the catalogue\'s', () => {
    const r = spendByMonth(g, months, '2026-10', 4);
    expect(r.map(x => x.key)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(r[0]).toEqual({ key: '2026-07', spent: 0, bought: 0 });
    expect(r[1]).toEqual({ key: '2026-08', spent: 2 * 250 + 2 * 1000, bought: 3 }); // kale at the catalogue price, rice at its own, salt unpriced
    expect(r[2]).toEqual({ key: '2026-09', spent: 0, bought: 0 });
    expect(r[3]).toEqual({ key: '2026-10', spent: 600 + 2 * 400, bought: 2 }); // a removed item still counts at its own price
  });
});

describe('item notes', () => {
  it('keeps a trimmed note and leaves the key out when there is none', () => {
    const c = normGrocery({ items: [{ id: 'a', n: 'A', note: '  the green ones ' }, { id: 'b', n: 'B', note: '  ' }, { id: 'c', n: 'C' }] });
    expect(c.items[0].note).toBe('the green ones');
    expect('note' in c.items[1]).toBe(false);
    expect('note' in c.items[2]).toBe(false);
  });
});

describe('a line with a price for each one', () => {
  it('is cleaned, totals the sum and counts how many there are', async () => {
    const { normGroceryMonth, lineCost, lineOf, parsePrices, spendByMonth } = await import('./grocery.js');
    const m = normGroceryMonth({ lines: { a: { prices: [899, 1049.5, 925] }, b: { prices: [899, 925], qty: 9, cents: 1, got: true }, c: { prices: [] }, d: { prices: 'x' }, e: { prices: Array(51).fill(1) } }, pulled: [] });
    expect(m.lines.a).toBeUndefined(); // a price that is not whole cents voids the list
    expect(m.lines.b).toEqual({ got: true, qty: 9, cents: 1, prices: [899, 925] });
    expect(Object.keys(m.lines)).toEqual(['b']);
    const item = { id: 'b', n: 'Beef', store: '', qty: 1, cents: null, every: true, out: false };
    const l = lineOf(item, m);
    expect(l.qty).toBe(2); expect(lineCost(l)).toBe(1824);
    expect(spendByMonth({ stores: [], items: [item] }, { '2026-10': m }, '2026-10', 1)[0]).toMatchObject({ spent: 1824, bought: 1 });
    expect(parsePrices('8.99, 10.49  $9.25;3')).toEqual([899, 1049, 925, 300]);
    expect(parsePrices('')).toBeNull(); expect(parsePrices('8.99, x')).toBeNull(); expect(parsePrices('1.234')).toBeNull();
  });
});
