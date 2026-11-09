import { describe, expect, it } from 'vitest';
import type { SupplementItem } from '../types.ts';
import { countedItems, limitStatus, overLimit, supplementNutrientTotals, toLimitUnit } from './supplementNutrients.js';

const D = '2026-11-08';
const item = (id: string, nutrients: SupplementItem['nutrients'], slot: SupplementItem['slot'] = 'morning'): SupplementItem => ({ id, n: id.toUpperCase(), slot, nutrients });
const multi = item('multi', [{ key: 'vitaminC', amount: 90, unit: 'mg' }, { key: 'zinc', amount: 11, unit: 'mg' }]);
const cplus = item('cplus', [{ key: 'vitaminC', amount: 1, unit: 'g' }], 'night');
const library = item('lib', [{ key: 'vitaminC', amount: 500, unit: 'mg' }], '');
const items = [multi, cplus, library];

describe('which items count', () => {
  it('counts only ticked scheduled items for "taken"', () => {
    expect(countedItems(items, { [D]: { multi: true } }, D, 'taken').map(i => i.id)).toEqual(['multi']);
    expect(countedItems(items, {}, D, 'taken')).toEqual([]);
  });
  it('counts every scheduled item for "scheduled", never library-only ones', () => {
    expect(countedItems(items, {}, D, 'scheduled').map(i => i.id)).toEqual(['multi', 'cplus']);
  });
  it('ignores a tick on a library-only item and ticks from another day', () => {
    expect(countedItems(items, { [D]: { lib: true }, '2026-11-07': { multi: true } }, D, 'taken')).toEqual([]);
  });
});

describe('totals', () => {
  it('sums a nutrient across two products and lists who adds what, biggest first', () => {
    const [c, z] = supplementNutrientTotals(items, { [D]: { multi: true, cplus: true } }, D);
    expect(c).toMatchObject({ key: 'vitaminC', unit: 'mg', fromSupplements: 1090, fromFood: 0, total: 1090 });
    expect(c.products).toEqual([{ itemId: 'cplus', name: 'CPLUS', amount: 1000 }, { itemId: 'multi', name: 'MULTI', amount: 90 }]);
    expect(z).toMatchObject({ key: 'zinc', total: 11 });
  });
  it('shows nothing for a nutrient no counted product lists, and for no data', () => {
    expect(supplementNutrientTotals(items, { [D]: { multi: true } }, D).map(t => t.key)).toEqual(['vitaminC', 'zinc']);
    expect(supplementNutrientTotals([{ id: 'a', n: 'A', slot: 'morning' }], { [D]: { a: true } }, D)).toEqual([]);
    expect(supplementNutrientTotals([], {}, D)).toEqual([]);
  });
  it('"scheduled" ignores ticks', () => {
    expect(supplementNutrientTotals(items, {}, D, 'scheduled')[0].total).toBe(1090);
  });
  it('keeps fromSupplements and fromFood as separate numbers', () => {
    const [t] = supplementNutrientTotals([multi], { [D]: { multi: true } }, D);
    expect(t.fromFood).toBe(0);
    expect(t.total).toBe(t.fromSupplements + t.fromFood);
  });
  it('orders nutrients like the limits table', () => {
    const it2 = item('x', [{ key: 'zinc', amount: 1, unit: 'mg' }, { key: 'calcium', amount: 1, unit: 'mg' }, { key: 'iron', amount: 1, unit: 'mg' }]);
    expect(supplementNutrientTotals([it2], { [D]: { x: true } }, D).map(t => t.key)).toEqual(['calcium', 'iron', 'zinc']);
  });
});

describe('units', () => {
  it('converts mg, mcg and g to the limit unit', () => {
    expect(toLimitUnit('vitaminC', 1, 'g', 'mg')).toEqual({ value: 1000 });
    expect(toLimitUnit('selenium', 0.2, 'mg', 'mcg')).toEqual({ value: 200 });
    expect(toLimitUnit('zinc', 15000, 'mcg', 'mg')).toEqual({ value: 15 });
    expect(toLimitUnit('copper', 1, 'g', 'mcg')).toEqual({ value: 1000000 });
  });
  it('converts vitamin D IU at 40 IU per mcg and adds it to mcg rows', () => {
    expect(toLimitUnit('vitaminD', 4000, 'IU', 'mcg')).toEqual({ value: 100 });
    const a = item('a', [{ key: 'vitaminD', amount: 1000, unit: 'IU' }]); const b = item('b', [{ key: 'vitaminD', amount: 25, unit: 'mcg' }]);
    expect(supplementNutrientTotals([a, b], { [D]: { a: true, b: true } }, D)[0]).toMatchObject({ unit: 'mcg', total: 50 });
  });
  it('lists IU for other nutrients as not added, with a reason, and still shows the nutrient', () => {
    const a = item('a', [{ key: 'vitaminE', amount: 400, unit: 'IU' }]);
    const [t] = supplementNutrientTotals([a], { [D]: { a: true } }, D);
    expect(t.total).toBe(0);
    expect(t.products).toEqual([]);
    expect(t.notAdded).toEqual([expect.objectContaining({ itemId: 'a', amount: 400, unit: 'IU', reason: expect.stringContaining('form') })]);
  });
});

describe('limit status', () => {
  it('is under, close at 80% and over; exactly the limit is close, not over', () => {
    expect(limitStatus({ key: 'zinc', total: 31 })).toEqual({ status: 'under', percent: 78, over: 0 });
    expect(limitStatus({ key: 'zinc', total: 32 })).toMatchObject({ status: 'close', percent: 80 });
    expect(limitStatus({ key: 'zinc', total: 40 })).toMatchObject({ status: 'close', percent: 100, over: 0 });
    expect(limitStatus({ key: 'zinc', total: 55 })).toEqual({ status: 'over', percent: 138, over: 15 });
  });
  it('finds the totals that are over', () => {
    const a = item('a', [{ key: 'zinc', amount: 50, unit: 'mg' }, { key: 'iron', amount: 10, unit: 'mg' }]);
    expect(overLimit(supplementNutrientTotals([a], { [D]: { a: true } }, D)).map(t => t.key)).toEqual(['zinc']);
  });
});
