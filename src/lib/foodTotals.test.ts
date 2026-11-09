import { describe, expect, it } from 'vitest';
import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { foodCoverage, supplementNutrientTotals } from './supplementNutrients.js';
import { coverageText, hasFoodData, limitWarning, totalsView } from './supplementTotalsView.js';

// Brief food-vitamins-minerals, PR B: food joins the totals only where the limit counts food; elsewhere it is shown beside the row with the reason. The sheet and the warning read these.
const day = '2026-09-24';
const food = (id: string, micro?: DietEntry['micro']): DietEntry => ({ id, d: day, n: `Food ${id}`, kcal: 100, p: 5, ...(micro ? { micro } : {}) });
const item = (nutrients: SupplementItem['nutrients']): SupplementItem => ({ id: 'a', n: 'Cap', slot: 'morning', nutrients });
const taken: Taken = { [day]: { a: true } };

describe('food in the totals', () => {
  it('adds food to a limit that counts food (zinc), keeping the two parts apart', () => {
    const [z] = supplementNutrientTotals([item([{ key: 'zinc', amount: 20, unit: 'mg' }])], taken, day, 'taken', [food('1', { zinc: 5 }), food('2', { zinc: 2.5 })]);
    expect(z).toMatchObject({ key: 'zinc', fromSupplements: 20, fromFood: 7.5, foodCounted: true, total: 27.5 });
  });
  it('shows food beside a supplements-only limit (magnesium) and a one-form limit (vitamin A) without adding it', () => {
    const t = supplementNutrientTotals([item([{ key: 'magnesium', amount: 300, unit: 'mg' }])], taken, day, 'taken', [food('1', { magnesium: 120, vitaminA: 400 })]);
    expect(t.find(x => x.key === 'magnesium')).toMatchObject({ fromSupplements: 300, fromFood: 120, foodCounted: false, total: 300 });
    expect(t.find(x => x.key === 'vitaminA')).toMatchObject({ fromSupplements: 0, fromFood: 400, foodCounted: false, total: 0 });
  });
  it('makes a row for a nutrient only food lists, in the table order, and counts food whatever the supplement basis', () => {
    const eaten = [food('1', { iron: 4, calcium: 200 })];
    expect(supplementNutrientTotals([], {}, day, 'taken', eaten).map(t => [t.key, t.total])).toEqual([['calcium', 200], ['iron', 4]]);
    expect(supplementNutrientTotals([item([{ key: 'iron', amount: 10, unit: 'mg' }])], {}, day, 'scheduled', eaten).find(t => t.key === 'iron')!.total).toBe(14);
  });
  it('with no food the totals are what they were', () => {
    const t = supplementNutrientTotals([item([{ key: 'zinc', amount: 20, unit: 'mg' }])], taken, day, 'taken');
    expect(t[0]).toMatchObject({ fromFood: 0, total: 20 });
  });
});

describe('coverage', () => {
  it('counts the eaten foods that list vitamins or minerals', () => {
    expect(foodCoverage([food('1', { iron: 1 }), food('2'), food('3', { zinc: 2 })])).toEqual({ eaten: 3, withData: 2 });
    expect(hasFoodData([food('2')])).toBe(false);
    expect(hasFoodData([food('1', { iron: 1 })])).toBe(true);
  });
  it('says it in words, with the warning that foods without data add nothing', () => {
    expect(coverageText([food('1', { iron: 1 }), food('2'), food('3')])).toBe('Food: 1 of 3 eaten foods had vitamin or mineral data. Foods without data add nothing, so food totals can be low.');
    expect(coverageText([food('1', { iron: 1 })])).toBe('Food: 1 of 1 eaten food had vitamin or mineral data.');
    expect(coverageText([])).toBe('');
  });
});

describe('the sheet rows and the warning with food', () => {
  it('words the food part of a row, counted or not', () => {
    const v = totalsView([item([{ key: 'zinc', amount: 20, unit: 'mg' }, { key: 'magnesium', amount: 100, unit: 'mg' }])], taken, day, 'taken', [food('1', { zinc: 5, magnesium: 80 })]);
    expect(v.rows.find(r => r.key === 'zinc')!.foodLine).toBe('Supplements 20 mg, food 5 mg.');
    expect(v.rows.find(r => r.key === 'magnesium')!.foodLine).toBe('Food 80 mg is not added: this limit counts supplements only.');
    expect(v.rows.find(r => r.key === 'magnesium')!.figure).toBe('100 mg from supplements'); // food is shown beside it but not added, so the figure says what it is
    expect(v.rows.find(r => r.key === 'zinc')!.figure).toBe('25 mg'); // food is added to this one
    expect(totalsView([item([{ key: 'zinc', amount: 20, unit: 'mg' }])], taken, day, 'taken').rows[0]!.foodLine).toBe('');
  });
  it('has data from food alone, and the empty state only when neither source lists any', () => {
    expect(totalsView([], {}, day, 'taken', [food('1', { iron: 3 })])).toMatchObject({ hasData: true, noneCounted: false });
    expect(totalsView([], {}, day, 'taken', [food('1')])).toMatchObject({ hasData: false, rows: [] });
  });
  it('warns when supplements plus food pass a limit that counts food, but not for food beside a supplements-only limit', () => {
    const items = [item([{ key: 'zinc', amount: 38, unit: 'mg' }, { key: 'magnesium', amount: 340, unit: 'mg' }])];
    expect(limitWarning(items, taken, day, [])).toBe('');
    expect(limitWarning(items, taken, day, [food('1', { zinc: 5, magnesium: 400 })])).toBe('Over an upper limit today: Zinc. Totals shows what each limit counts. General information, not medical advice.');
  });
});
