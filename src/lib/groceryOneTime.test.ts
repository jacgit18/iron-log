import { describe, expect, it } from 'vitest';
import { carryOver, mergeGrocery, normGroceryData, onList, untickBlock, usedOneTime, withoutUsed } from './grocery.js';
import { normGroceryItem, validGroceryItem } from '../shared/grocery.js';
import type { Grocery, GroceryItem, GroceryMonth } from '../types.ts';

// Brief quickadd-one-time-items: a one-time item that was bought in any month is hidden from Inventory and later months' lists, never deleted.
const item = (id: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({ id, n: id, store: '', qty: 1, cents: 300, every: true, out: false, ...extra });
const milk = item('milk', { every: false, out: true, oneTime: '2026-10' });
const g: Grocery = { stores: [], items: [item('rice'), milk, item('kale', { oneTime: '2026-10' })] };
const month = (lines: GroceryMonth['lines']): GroceryMonth => ({ lines, pulled: [] });

describe('usedOneTime', () => {
  it('is empty when no one-time item was bought', () => {
    expect(usedOneTime(g, {}).size).toBe(0);
    expect(usedOneTime(g, { '2026-11': month({ rice: { got: true } }) }).size).toBe(0); // rice is not one-time
  });
  it('holds a one-time item bought in any month, and only that', () => {
    const used = usedOneTime(g, { '2026-10': month({ milk: { got: true } }), '2026-11': month({ kale: { have: true } }) });
    expect([...used]).toEqual(['milk']); // a Have tick is not a purchase
  });
  it('is not used again once the purchase is unticked', () => {
    expect(usedOneTime(g, { '2026-11': month({ milk: { qty: 2 } }) }).size).toBe(0);
  });
});

describe('withoutUsed', () => {
  it('drops used items from the catalogue and keeps everything else, deleting nothing', () => {
    const months = { '2026-11': month({ milk: { got: true } }) };
    expect(withoutUsed(g, months).items.map(i => i.id)).toEqual(['rice', 'kale']);
    expect(g.items.map(i => i.id)).toEqual(['rice', 'milk', 'kale']);
  });
  it('hands back the same object when nothing is used', () => {
    expect(withoutUsed(g, {})).toBe(g);
  });
});

describe('onList', () => {
  const bought = month({ milk: { got: true } });
  const used = usedOneTime(g, { '2026-11': bought });
  it('keeps a used item on the month it was bought in', () => {
    expect(onList(g, bought, true, used).map(i => i.id)).toContain('milk');
  });
  it('leaves a used item off every other month, this month or planned ahead', () => {
    expect(onList(g, month({}), true, used).map(i => i.id)).toEqual(['rice', 'kale']);
  });
  it('does not change a past month, which shows what was bought then', () => {
    expect(onList(g, bought, false, used).map(i => i.id)).toEqual(['milk']);
    expect(onList(g, month({}), false, used)).toEqual([]);
  });
  it('is unchanged when no set is given', () => {
    expect(onList(g, month({}), true).map(i => i.id)).toEqual(['rice', 'milk', 'kale']);
  });
});

describe('carryOver', () => {
  it('does not carry a used one-time item into the new month as have', () => {
    const months = { '2026-10': month({ milk: { got: true }, rice: { have: true } }) };
    expect(carryOver(g, months, '2026-11')).toEqual({ from: '2026-10', ids: ['rice'] });
  });
});

describe('purchases from before it was made one-time', () => {
  it('do not count: ticking One-time on an item bought last month leaves it visible', () => {
    const rice = item('rice', { oneTime: '2026-11' });
    const gg: Grocery = { stores: [], items: [rice] };
    expect(usedOneTime(gg, { '2026-10': month({ rice: { got: true } }) }).size).toBe(0);
    expect(withoutUsed(gg, { '2026-10': month({ rice: { got: true } }) }).items).toHaveLength(1);
  });
  it('count from the month it was made one-time, in that month or a later one', () => {
    const rice = item('rice', { oneTime: '2026-11' });
    const gg: Grocery = { stores: [], items: [rice] };
    expect(usedOneTime(gg, { '2026-11': month({ rice: { got: true } }) }).has('rice')).toBe(true);
    expect(usedOneTime(gg, { '2026-12': month({ rice: { got: true } }) }).has('rice')).toBe(true);
  });
});

describe('a row open in Edit', () => {
  it('stays in the list while it is open, even when used', () => {
    const months = { '2026-11': month({ milk: { got: true } }) };
    expect(withoutUsed(g, months, new Set(['milk'])).items.map(i => i.id)).toEqual(['rice', 'milk', 'kale']);
    expect(withoutUsed(g, months, new Set(['rice'])).items.map(i => i.id)).toEqual(['rice', 'kale']);
  });
});

describe('backup import with a used and a fresh item of the same name', () => {
  const usedMilk = item('milk-1', { n: 'Milk', store: 'Aldi', every: false, out: true, oneTime: '2026-10' });
  const freshMilk = item('milk-2', { n: 'Milk', store: 'Aldi', every: false, out: true, oneTime: '2026-11' });
  const file = { stores: ['Aldi'], items: [freshMilk, usedMilk], months: { '2026-10': month({ 'milk-1': { got: true } }), '2026-11': month({ 'milk-2': { qty: 2 } }) } };
  it('keeps them as two items and each one\'s month lines on its own item', () => {
    const r = mergeGrocery({ stores: [], items: [] }, {}, file);
    expect(r.grocery.items.filter(i => i.n === 'Milk')).toHaveLength(2);
    expect(Object.keys(r.months['2026-10']!.lines)).toHaveLength(1);
    const ids = r.grocery.items.map(i => i.id);
    expect(ids).toContain(Object.keys(r.months['2026-10']!.lines)[0]);
    expect(Object.keys(r.months['2026-11']!.lines)[0]).not.toBe(Object.keys(r.months['2026-10']!.lines)[0]);
  });
  it('importing the same file again adds nothing', () => {
    const first = mergeGrocery({ stores: [], items: [] }, {}, file);
    const again = mergeGrocery(first.grocery, first.months, file);
    expect(again.grocery.items).toHaveLength(2);
  });
  it('an incoming fresh Milk joins the unused Milk here, not a used one', () => {
    const here: Grocery = { stores: ['Aldi'], items: [usedMilk, { ...freshMilk, id: 'local-fresh' }] };
    const r = mergeGrocery(here, { '2026-10': month({ 'milk-1': { got: true } }) }, { stores: ['Aldi'], items: [{ ...freshMilk, id: 'other' }], months: {} });
    expect(r.grocery.items).toHaveLength(2);
  });
});

describe('the field in saved data', () => {
  it('is kept only as a month', () => {
    expect(normGroceryItem({ id: 'a', n: 'A', every: false, out: true, oneTime: '2026-11' })?.oneTime).toBe('2026-11');
    expect(normGroceryItem({ id: 'a', n: 'A', every: true, oneTime: true })?.oneTime).toBeUndefined();
    expect(normGroceryItem({ id: 'a', n: 'A', every: true, oneTime: 'soon' })?.oneTime).toBeUndefined();
  });
  it('is accepted by the server check as a month and refused as anything else', () => {
    expect(validGroceryItem({ ...milk })).toBe(true);
    expect(validGroceryItem({ ...milk, oneTime: true })).toBe(false);
    expect(validGroceryItem({ ...milk, oneTime: '2026-13' })).toBe(false);
    expect(validGroceryItem(item('rice'))).toBe(true);
  });
  it('is kept by a backup round trip', () => {
    const back = normGroceryData(JSON.parse(JSON.stringify({ ...g, months: {} })));
    expect(back?.items.find(i => i.id === 'milk')?.oneTime).toBe('2026-10');
    expect(back?.items.find(i => i.id === 'rice')?.oneTime).toBeUndefined();
  });
  it('is separate from the older `once` (an occasional item)', () => {
    const old = normGroceryItem({ id: 'b', n: 'B', once: true });
    expect(old?.every).toBe(false);
    expect(old?.oneTime).toBeUndefined();
  });
});

describe('untickBlock', () => {
  const aldi = (id: string, extra: Partial<GroceryItem> = {}) => item(id, { n: 'Milk', store: 'Aldi', every: false, out: true, ...extra });
  const old = aldi('milk-1', { oneTime: '2026-10' }), fresh = aldi('milk-2', { oneTime: '2026-11' });
  const gg: Grocery = { stores: ['Aldi'], items: [fresh, old] };
  const months = { '2026-10': month({ 'milk-1': { got: true } }) };
  it('refuses to bring a used item back beside an active one with its name and store', () => {
    expect(untickBlock(gg, months, '2026-10', 'milk-1')).toBe('There is already a Milk under Aldi. Remove it first, then untick this one.');
  });
  it('allows it when no other item holds the name, or the other one is itself used', () => {
    expect(untickBlock({ stores: ['Aldi'], items: [old] }, months, '2026-10', 'milk-1')).toBeNull();
    const both = { '2026-10': month({ 'milk-1': { got: true } }), '2026-11': month({ 'milk-2': { got: true } }) };
    expect(untickBlock(gg, both, '2026-10', 'milk-1')).toBeNull();
  });
  it('allows it in another store, and for an item that is not one-time or not used', () => {
    expect(untickBlock({ stores: ['Aldi', 'Lidl'], items: [{ ...fresh, store: 'Lidl' }, old] }, months, '2026-10', 'milk-1')).toBeNull();
    expect(untickBlock({ stores: ['Aldi'], items: [{ ...old, oneTime: undefined }, fresh] }, months, '2026-10', 'milk-1')).toBeNull();
    expect(untickBlock(gg, {}, '2026-10', 'milk-1')).toBeNull();
  });
  it('allows it when another month still holds a purchase, so the item stays used', () => {
    const two = { '2026-10': month({ 'milk-1': { got: true } }), '2026-11': month({ 'milk-1': { got: true } }) };
    expect(untickBlock(gg, two, '2026-10', 'milk-1')).toBeNull();
  });
});
