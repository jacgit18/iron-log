import { describe, expect, it } from 'vitest';
import type { IngredientLimit, SupplementItem } from '../types.ts';
import { capWarning, convertAmount, rowIds, ingredientRows, ingredientTotals, ingredientsOverCap, limitPosition } from './supplementIngredients.js';

// Brief supplement-active-ingredients: a day's sums (taken or scheduled, portion, units) and where they stand against the person's own limit.
const D = '2026-11-10';
const oil = (id: string, slot: SupplementItem['slot'], rows: SupplementItem['ingredients'], portion?: number): SupplementItem => ({ id, n: 'Fish oil', slot, ingredients: rows, ...(portion ? { portion } : {}) });
const ticked = (...ids: string[]) => ({ [D]: Object.fromEntries(ids.map(i => [i, true as const])) });
const row = (items: SupplementItem[], taken: Record<string, Record<string, true>>, key: string, limits: Record<string, IngredientLimit> = {}, basis: 'taken' | 'scheduled' = 'taken') => ingredientRows(items, taken, D, basis, limits).find(r => r.key === key);

describe('ingredientTotals', () => {
  it('adds two products and the same name in any case', () => {
    const a = oil('a', 'morning', [{ name: 'Omega-3', amount: 475, unit: 'mg' }]);
    const b: SupplementItem = { id: 'b', n: 'Cod liver', slot: 'night', ingredients: [{ name: 'omega-3', amount: 0.5, unit: 'g' }] };
    const t = ingredientTotals([a, b], ticked('a', 'b'), D)[0];
    expect(t).toMatchObject({ key: 'omega-3', total: 975, unit: 'mg' });
    expect(t.products.map(p => p.amount)).toEqual([500, 475]);
  });
  it('multiplies by the portion taken each time', () => {
    expect(ingredientTotals([oil('a', 'morning', [{ name: 'EPA', amount: 175, unit: 'mg' }], 2)], ticked('a'), D)[0].total).toBe(350);
    expect(ingredientTotals([oil('a', 'morning', [{ name: 'EPA', amount: 175, unit: 'mg' }], 0.5)], ticked('a'), D)[0].total).toBe(87.5);
  });
  it('counts only what was ticked, or everything scheduled', () => {
    const items = [oil('a', 'morning', [{ name: 'DHA', amount: 150, unit: 'mg' }]), oil('b', 'night', [{ name: 'DHA', amount: 150, unit: 'mg' }])];
    expect(ingredientTotals(items, ticked('a'), D, 'taken')[0].total).toBe(150);
    expect(ingredientTotals(items, {}, D, 'taken')).toEqual([]);
    expect(ingredientTotals(items, {}, D, 'scheduled')[0].total).toBe(300);
  });
  it('leaves out a supplement that is not on the schedule', () => {
    expect(ingredientTotals([oil('a', '', [{ name: 'DHA', amount: 150, unit: 'mg' }])], ticked('a'), D, 'scheduled')).toEqual([]);
  });
  it('lists curated names first, then typed names A to Z', () => {
    const a: SupplementItem = { id: 'a', n: 'Mix', slot: 'morning', ingredients: [{ name: 'Zinc carnosine', amount: 1, unit: 'mg' }, { name: 'Caffeine', amount: 100, unit: 'mg' }, { name: 'Ashwagandha', amount: 600, unit: 'mg' }, { name: 'Omega-3', amount: 1, unit: 'g' }] };
    expect(ingredientTotals([a], ticked('a'), D).map(t => t.label)).toEqual(['Omega-3', 'Caffeine', 'Ashwagandha', 'Zinc carnosine']);
  });
  it('shows an ingredient you set a limit for although nothing lists it today', () => {
    const t = ingredientTotals([], {}, D, 'taken', { creatine: { kind: 'target', amount: 5, unit: 'g' } });
    expect(t).toEqual([{ key: 'creatine', label: 'Creatine', unit: 'g', total: 0, products: [], notAdded: [] }]);
  });
});

describe('units', () => {
  it('converts g, mg and mcg to the limit unit', () => {
    expect(convertAmount(5, 'g', 'mg')).toBe(5000);
    expect(convertAmount(2500, 'mcg', 'mg')).toBe(2.5);
    expect(convertAmount(1, 'mg', 'mcg')).toBe(1000);
    expect(convertAmount(3, 'IU', 'IU')).toBe(3);
  });
  it('never converts IU to a mass or a mass to IU', () => {
    expect(convertAmount(100, 'IU', 'mg')).toBeUndefined();
    expect(convertAmount(100, 'mg', 'IU')).toBeUndefined();
  });
  it('shows an IU row against a mg limit as not added, different units', () => {
    const a = oil('a', 'morning', [{ name: 'Vitamin X', amount: 1000, unit: 'IU' }, { name: 'Vitamin X', amount: 5, unit: 'mg' }]);
    const r = row([a], ticked('a'), 'vitamin x', { 'vitamin x': { kind: 'cap', amount: 10, unit: 'mg' } })!;
    expect(r.total).toBe(5);
    expect(r.notAddedLines).toEqual(['Fish oil: 1,000 IU not added, different units: your cap is in mg.']);
  });
  it('matches an IU row to an IU limit only', () => {
    const a = oil('a', 'morning', [{ name: 'Vitamin X', amount: 1000, unit: 'IU' }]);
    expect(row([a], ticked('a'), 'vitamin x', { 'vitamin x': { kind: 'target', amount: 2000, unit: 'IU' } })).toMatchObject({ total: 1000, status: 'under', statusText: '50% of your target' });
  });
  it('without a limit uses the unit of the first row', () => {
    const a = oil('a', 'morning', [{ name: 'Creatine', amount: 5, unit: 'g' }]);
    expect(row([a], ticked('a'), 'creatine')).toMatchObject({ figure: '5 g', status: 'none', statusText: '', limitText: '', percent: 0 });
  });
});

describe('limit status', () => {
  const cap: IngredientLimit = { kind: 'cap', amount: 400, unit: 'mg' };
  it('a target is met at or above the amount', () => {
    const t: IngredientLimit = { kind: 'target', amount: 1000, unit: 'mg' };
    expect(limitPosition(650, t)).toEqual({ status: 'under', percent: 65, over: 0 });
    expect(limitPosition(1000, t).status).toBe('met');
    expect(limitPosition(1500, t).status).toBe('met');
  });
  it('a cap is under, close from 80%, and over only above it', () => {
    expect(limitPosition(180, cap).status).toBe('under');
    expect(limitPosition(320, cap).status).toBe('close');
    expect(limitPosition(400, cap).status).toBe('close');
    expect(limitPosition(430, cap)).toEqual({ status: 'over', percent: 108, over: 30 });
  });
  it('says it in words and keeps the bar at 100 when over', () => {
    const a = oil('a', 'morning', [{ name: 'Caffeine', amount: 430, unit: 'mg' }]);
    expect(row([a], ticked('a'), 'caffeine', { caffeine: cap })).toMatchObject({ statusText: 'Over your cap by 30 mg', limitText: 'Your cap: 400 mg a day', percent: 100, status: 'over' });
    expect(row([oil('a', 'morning', [{ name: 'Caffeine', amount: 180, unit: 'mg' }])], ticked('a'), 'caffeine', { caffeine: cap })).toMatchObject({ statusText: '45% of your cap' });
    expect(row([oil('a', 'morning', [{ name: 'Creatine', amount: 5, unit: 'g' }])], ticked('a'), 'creatine', { creatine: { kind: 'target', amount: 5, unit: 'g' } })!.statusText).toBe('Target met');
  });
  it('compares in the limit unit', () => {
    const a = oil('a', 'morning', [{ name: 'Creatine', amount: 3, unit: 'g' }]);
    expect(row([a], ticked('a'), 'creatine', { creatine: { kind: 'cap', amount: 2000, unit: 'mg' } })).toMatchObject({ total: 3000, unit: 'mg', status: 'over' });
  });
});

describe('over-cap warning', () => {
  const a = oil('a', 'morning', [{ name: 'Caffeine', amount: 430, unit: 'mg' }, { name: 'Creatine', amount: 9, unit: 'g' }]);
  const limits: Record<string, IngredientLimit> = { caffeine: { kind: 'cap', amount: 400, unit: 'mg' }, creatine: { kind: 'target', amount: 5, unit: 'g' } };
  it('names a cap that was passed and never a target', () => {
    expect(ingredientsOverCap([a], ticked('a'), D, limits)).toEqual(['Caffeine']);
    expect(capWarning([a], ticked('a'), D, limits)).toMatch(/^Over your own cap today: Caffeine\./);
  });
  it('is empty when nothing was taken or no cap is set', () => {
    expect(capWarning([a], {}, D, limits)).toBe('');
    expect(capWarning([a], ticked('a'), D, {})).toBe('');
  });
});

describe('rowIds', () => {
  it('slugs names and numbers a repeat so two rows never share an id', () => {
    expect(rowIds(['omega-3', 'l-theanine', 'l theanine', 'l.theanine'])).toEqual(['omega-3', 'l-theanine', 'l-theanine-2', 'l-theanine-3']);
    expect(rowIds(['***'])).toEqual(['item']);
  });
});
