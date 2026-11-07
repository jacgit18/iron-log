import { describe, expect, it } from 'vitest';
import type { GroceryItem, GroceryMonth } from '../types.ts';
import { itemHistory, lastBoughtText, shortMonth } from './itemHistory.js';

const item = (extra: Partial<GroceryItem> = {}): GroceryItem => ({ id: 'eggs', n: 'Eggs', store: 'Aldi', qty: 1, cents: 300, every: true, out: false, ...extra });
const month = (lines: GroceryMonth['lines']): GroceryMonth => ({ lines, pulled: [] });
const months: Record<string, GroceryMonth> = {
  '2026-07': month({ eggs: { got: true, cents: 379 } }),
  '2026-08': month({ eggs: { got: true, cents: 299, store: 'Costco', qty: 2 } }),
  '2026-09': month({ eggs: { have: true } }),
  '2026-10': month({ eggs: { got: true, cents: 349 } }),
};

describe('itemHistory', () => {
  it('lists only the months it was bought, newest first, with the month store when there is one', () => {
    const h = itemHistory(item(), months);
    expect(h.purchases.map(p => [p.month, p.store, p.qty, p.each])).toEqual([['2026-10', 'Aldi', 1, 349], ['2026-08', 'Costco', 2, 299], ['2026-07', 'Aldi', 1, 379]]);
  });
  it('finds the cheapest and average price each and the store bought at most often', () => {
    const h = itemHistory(item(), months);
    expect(h).toMatchObject({ cheapestEach: 299, averageEach: 342, topStore: 'Aldi', priced: 3 });
  });
  it('averages the packs of one purchase, and leaves a purchase with no price out of cheapest and average', () => {
    const m = { '2026-10': month({ eggs: { got: true, prices: [250, 300], qty: 2 } }), '2026-09': month({ eggs: { got: true, unpriced: true } }) };
    const h = itemHistory(item({ cents: null }), m);
    expect(h.purchases.map(p => p.each)).toEqual([275, null]);
    expect(h).toMatchObject({ cheapestEach: 275, averageEach: 275, priced: 1 });
  });
  it('gives a tie between stores to the most recent one, and nothing for an item never bought', () => {
    const m = { '2026-09': month({ eggs: { got: true, store: 'Costco' } }), '2026-10': month({ eggs: { got: true } }) };
    expect(itemHistory(item(), m).topStore).toBe('Aldi');
    expect(itemHistory(item(), { '2026-10': month({}) })).toEqual({ purchases: [], cheapestEach: null, averageEach: null, topStore: '', priced: 0 });
  });
});

describe('lastBoughtText and shortMonth', () => {
  it('reads Last: price at store, month; Anywhere for no store; no price when unpriced; per unit for a weighed item', () => {
    const now = '2026-11';
    expect(lastBoughtText(item(), itemHistory(item(), months), now)).toBe('Last: $3.49 at Aldi, Oct');
    expect(lastBoughtText(item({ store: '' }), itemHistory(item({ store: '' }), months), now)).toBe('Last: $3.49 at Anywhere, Oct');
    expect(lastBoughtText(item({ cents: null }), itemHistory(item({ cents: null }), { '2026-10': month({ eggs: { got: true, unpriced: true } }) }), now)).toBe('Last: no price at Aldi, Oct');
    expect(lastBoughtText(item({ unit: 'lb' }), itemHistory(item({ unit: 'lb' }), months), now)).toBe('Last: $3.49/lb at Aldi, Oct');
    expect(lastBoughtText(item(), itemHistory(item(), { '2026-09': month({}) }), now)).toBe('');
  });
  it('adds the year only for another year', () => {
    expect(shortMonth('2026-10', '2026-11')).toBe('Oct');
    expect(shortMonth('2025-10', '2026-11')).toMatch(/2025/);
  });
});
