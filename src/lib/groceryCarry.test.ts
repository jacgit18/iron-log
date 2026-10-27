import { describe, expect, it } from 'vitest';
import { carriedCount, carryOver, mergeGrocery, normGroceryMonth, onList, tally } from './grocery.js';
import { monthEmpty } from '../shared/grocery.js';
import type { Grocery, GroceryItem, GroceryMonth } from '../types.ts';

// ADR 079: a new month starts with the At home ticks of the latest earlier month that had any.
const item = (id: string, cents: number | null = 300): GroceryItem => ({ id, n: id, store: '', qty: 1, cents, every: true, out: false });
const g: Grocery = { stores: [], items: [item('rice'), item('kale'), item('salt'), item('milk')] };
const month = (lines: GroceryMonth['lines'], extra: Partial<GroceryMonth> = {}): GroceryMonth => ({ lines, pulled: [], ...extra });

describe('carryOver', () => {
  const sep = month({ rice: { have: true }, kale: { got: true, qty: 2, cents: 310 }, salt: { qty: 3 } }); // salt has a count but no tick

  it('carries a Have tick and a bought tick, and nothing else', () => {
    expect(carryOver(g, { '2026-09': sep }, '2026-10')).toEqual({ from: '2026-09', ids: ['rice', 'kale'] });
  });

  it('looks back past a month with no record to the latest one that has ticks', () => {
    expect(carryOver(g, { '2026-07': sep, '2026-08': month({ salt: { qty: 2 } }) }, '2026-10')).toEqual({ from: '2026-07', ids: ['rice', 'kale'] });
  });

  it('takes the most recent month, not an older one', () => {
    const aug = month({ milk: { have: true } });
    expect(carryOver(g, { '2026-08': aug, '2026-09': sep }, '2026-10')?.from).toBe('2026-09');
  });

  it('carries nothing when no earlier month has a tick', () => {
    expect(carryOver(g, {}, '2026-10')).toBeNull();
    expect(carryOver(g, { '2026-09': month({ salt: { qty: 3 } }) }, '2026-10')).toBeNull();
  });

  it('ignores later months: only earlier ones feed this one', () => {
    expect(carryOver(g, { '2026-11': sep }, '2026-10')).toBeNull();
  });

  it('skips items no longer in the catalogue', () => {
    const gone = month({ rice: { have: true }, ghost: { have: true } });
    expect(carryOver(g, { '2026-09': gone }, '2026-10')?.ids).toEqual(['rice']);
  });

  it('does not seed a month that has its own ticks or purchases', () => {
    expect(carryOver(g, { '2026-09': sep, '2026-10': month({ milk: { have: true } }) }, '2026-10')).toBeNull();
    expect(carryOver(g, { '2026-09': sep, '2026-10': month({ milk: { got: true } }) }, '2026-10')).toBeNull();
  });

  it('seeds a month that only has a count or price typed', () => {
    expect(carryOver(g, { '2026-09': sep, '2026-10': month({ milk: { qty: 2 } }) }, '2026-10')?.ids).toEqual(['rice', 'kale']);
  });

  it('seeds once: the marker stops it even after every tick is cleared', () => {
    expect(carryOver(g, { '2026-09': sep, '2026-10': month({}, { carried: '2026-09' }) }, '2026-10')).toBeNull();
  });
});

describe('a seeded month', () => {
  const sep = month({ rice: { have: true }, kale: { got: true, qty: 2, cents: 310 } });
  const oct = month({ rice: { have: true }, kale: { have: true } }, { carried: '2026-09' });

  it('takes the carried items off To get and leaves the rest on it', () => {
    expect(onList(g, oct, true).map(i => i.id)).toEqual(['salt', 'milk']);
  });

  it('spends nothing: a carried tick is a Have tick, not a purchase', () => {
    const t = tally(onList(g, oct, true), oct);
    expect(t.spent).toBe(0); expect(t.got).toBe(0);
  });

  it('counts the carried items still ticked, and none once they are cleared or the month was not seeded', () => {
    expect(carriedCount(g, { '2026-09': sep, '2026-10': oct }, '2026-10')).toBe(2);
    expect(carriedCount(g, { '2026-09': sep, '2026-10': month({ rice: { have: true } }, { carried: '2026-09' }) }, '2026-10')).toBe(1);
    expect(carriedCount(g, { '2026-09': sep, '2026-10': month({}, { carried: '2026-09' }) }, '2026-10')).toBe(0);
    expect(carriedCount(g, { '2026-09': sep, '2026-10': month({ rice: { have: true } }) }, '2026-10')).toBe(0);
  });
});

describe('the marker in a saved month', () => {
  it('is kept when it is a month key and dropped otherwise', () => {
    expect(normGroceryMonth({ lines: {}, pulled: [], carried: '2026-09' }).carried).toBe('2026-09');
    expect(normGroceryMonth({ lines: {}, pulled: [], carried: 'last month' }).carried).toBeUndefined();
    expect(normGroceryMonth({ lines: {}, pulled: [], carried: 7 }).carried).toBeUndefined();
  });

  it('keeps an emptied month: the marker is content', () => {
    expect(monthEmpty(month({}, { carried: '2026-09' }))).toBe(false);
    expect(monthEmpty(month({}))).toBe(true);
  });

  it('survives an import merge into a month that has none', () => {
    const inc = { stores: [], items: [item('rice')], months: { '2026-10': month({ rice: { have: true } }, { carried: '2026-09' }) } };
    const out = mergeGrocery({ stores: [], items: [item('rice')] }, {}, inc);
    expect(out.months['2026-10']?.carried).toBe('2026-09');
  });
});
