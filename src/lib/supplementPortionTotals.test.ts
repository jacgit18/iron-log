import { describe, expect, it } from 'vitest';
import type { SupplementItem } from '../types.ts';
import { supplementNutrientTotals, targetTotals } from './supplementNutrients.js';
import { totalsView } from './supplementTotalsView.js';

// Brief supplement-portions: the five cases from the preview. Every nutrient row is the amount in ONE label serving; a tick counts the servings taken at that intake.
const D = '2026-11-09';
const mag = (id: string, slot: SupplementItem['slot'], portion?: number): SupplementItem => ({ id, n: 'Magnesium glycinate', slot, serving: { units: 2, form: 'Capsule' }, nutrients: [{ key: 'magnesium', amount: 200, unit: 'mg' }], ...(portion ? { portion } : {}) });
const zinc = (id: string, slot: SupplementItem['slot'], portion?: number): SupplementItem => ({ id, n: 'Zinc picolinate', slot, serving: { units: 1, form: 'Tablet' }, nutrients: [{ key: 'zinc', amount: 15, unit: 'mg' }], ...(portion ? { portion } : {}) });
const vitC = (id: string): SupplementItem => ({ id, n: 'Vitamin C', slot: 'morning', serving: { units: 1, form: 'Tablet' }, nutrients: [{ key: 'vitaminC', amount: 500, unit: 'mg' }] });
const total = (items: SupplementItem[], key: string, basis: 'taken' | 'scheduled' = 'taken') => {
  const ticks = Object.fromEntries(items.map(i => [i.id, true as const]));
  return supplementNutrientTotals(items, { [D]: ticks }, D, basis).find(t => t.key === key)?.total;
};

describe('portions in the totals', () => {
  it('twice a day, two capsules each time: 400 mg', () => {
    expect(total([mag('a', 'morning'), mag('b', 'night')], 'magnesium')).toBe(400);
  });
  it('once a day: 15 mg of zinc', () => {
    expect(total([zinc('z', 'noon')], 'zinc')).toBe(15);
  });
  it('labelled twice a day but taken once: 500 mg of vitamin C, not 1000', () => {
    expect(total([vitC('c')], 'vitaminC')).toBe(500);
  });
  it('half a serving (1 of 2 capsules): 100 mg', () => {
    expect(total([mag('a', 'morning', 0.5)], 'magnesium')).toBe(100);
  });
  it('two tablets at once (a 1-tablet serving): 30 mg', () => {
    expect(total([zinc('z', 'noon', 2)], 'zinc')).toBe(30);
  });
  it('morning 2 capsules and night 1 capsule add to 300 mg', () => {
    expect(total([mag('a', 'morning'), mag('b', 'night', 0.5)], 'magnesium')).toBe(300);
  });
  it('the scheduled basis multiplies too, and an unticked intake counts only there', () => {
    const items = [mag('a', 'morning', 0.5), mag('b', 'night', 2)];
    expect(supplementNutrientTotals(items, { [D]: { a: true } }, D, 'taken')[0].total).toBe(100);
    expect(supplementNutrientTotals(items, { [D]: { a: true } }, D, 'scheduled')[0].total).toBe(100 + 400);
  });
  it('an item with no portion totals exactly as before', () => {
    const [t] = supplementNutrientTotals([mag('a', 'morning')], { [D]: { a: true } }, D);
    expect(t).toMatchObject({ total: 200, fromSupplements: 200, products: [{ itemId: 'a', name: 'Magnesium glycinate', amount: 200 }] });
  });
  it('counts the nutrients without an upper limit by the portion as well', () => {
    const fiber: SupplementItem = { id: 'f', n: 'Fiber', slot: 'morning', serving: { units: 2, form: 'Capsule' }, nutrients: [{ key: 'fiber', amount: 4, unit: 'g' }], portion: 1.5 };
    expect(targetTotals([fiber], { [D]: { f: true } }, D)[0].total).toBe(6);
  });
  it('an amount that cannot be added is reported as the amount taken', () => {
    const a: SupplementItem = { id: 'a', n: 'A oil', slot: 'morning', serving: { units: 2 }, nutrients: [{ key: 'vitaminA', amount: 5000, unit: 'IU' }], portion: 0.5 };
    expect(supplementNutrientTotals([a], { [D]: { a: true } }, D)[0].notAdded[0]).toMatchObject({ amount: 2500, unit: 'IU' });
  });
});

describe('the Totals sheet names a portion', () => {
  it('puts the capsule count after the product name only when it is not one serving', () => {
    const items = [mag('a', 'morning', 0.5), zinc('z', 'noon')];
    const v = totalsView(items, { [D]: { a: true, z: true } }, D, 'taken');
    expect(v.rows.find(r => r.key === 'magnesium')?.products).toEqual(['Magnesium glycinate (1 capsule) 100 mg']);
    expect(v.rows.find(r => r.key === 'zinc')?.products).toEqual(['Zinc picolinate 15 mg']);
  });
});
