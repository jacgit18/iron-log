import { describe, expect, it } from 'vitest';
import { carryOver, normGroceryData, onList, usedOneTime, withoutUsed } from './grocery.js';
import { normGroceryItem, validGroceryItem } from '../shared/grocery.js';
import type { Grocery, GroceryItem, GroceryMonth } from '../types.ts';

// Brief quickadd-one-time-items: a one-time item that was bought in any month is hidden from Inventory and later months' lists, never deleted.
const item = (id: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({ id, n: id, store: '', qty: 1, cents: 300, every: true, out: false, ...extra });
const milk = item('milk', { every: false, out: true, oneTime: true });
const g: Grocery = { stores: [], items: [item('rice'), milk, item('kale', { oneTime: true })] };
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

describe('the field in saved data', () => {
  it('is kept only as true', () => {
    expect(normGroceryItem({ id: 'a', n: 'A', every: false, out: true, oneTime: true })?.oneTime).toBe(true);
    expect(normGroceryItem({ id: 'a', n: 'A', every: true, oneTime: 'yes' })?.oneTime).toBeUndefined();
    expect(normGroceryItem({ id: 'a', n: 'A', every: true, oneTime: false })?.oneTime).toBeUndefined();
  });
  it('is accepted by the server check as true and refused as anything else', () => {
    expect(validGroceryItem({ ...milk })).toBe(true);
    expect(validGroceryItem({ ...milk, oneTime: false })).toBe(false);
    expect(validGroceryItem(item('rice'))).toBe(true);
  });
  it('is kept by a backup round trip', () => {
    const back = normGroceryData(JSON.parse(JSON.stringify({ ...g, months: {} })));
    expect(back?.items.find(i => i.id === 'milk')?.oneTime).toBe(true);
    expect(back?.items.find(i => i.id === 'rice')?.oneTime).toBeUndefined();
  });
  it('is separate from the older `once` (an occasional item)', () => {
    const old = normGroceryItem({ id: 'b', n: 'B', once: true });
    expect(old?.every).toBe(false);
    expect(old?.oneTime).toBeUndefined();
  });
});
