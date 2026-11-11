import { describe, expect, it } from 'vitest';
import type { IngredientLimit, SupplementItem, Taken } from '../types.ts';
import { dayIngredientMeter, ingredientClosedLine } from './dayIngredientMeter.js';
import { ingredientRows } from './supplementIngredients.js';

// Brief ingredient-day-bars (layout A): the day's ingredient line reads the rows the Totals sheet draws, so these tests feed real supplements through `ingredientRows`.
const day = '2026-11-10';
const salmon: SupplementItem = { id: 's', n: 'Salmon oil', slot: 'morning', ingredients: [{ name: 'Omega-3', amount: 1000, unit: 'mg' }, { name: 'EPA', amount: 330, unit: 'mg' }] };
const creatine: SupplementItem = { id: 'c', n: 'Creatine', slot: 'morning', ingredients: [{ name: 'Creatine', amount: 5000, unit: 'mg' }] };
const limits: Record<string, IngredientLimit> = { 'omega-3': { kind: 'cap', amount: 1500, unit: 'mg' }, epa: { kind: 'target', amount: 500, unit: 'mg' } };
const ticked = (...items: SupplementItem[]): Taken => ({ [day]: Object.fromEntries(items.map(i => [i.id, true as const])) });
const view = (items: SupplementItem[], taken: Taken, lim = limits) => dayIngredientMeter(ingredientRows(items, taken, day, 'taken', lim));

describe('what is drawn', () => {
  it('nothing when no limit is set, even with ingredients listed', () => {
    expect(view([salmon], ticked(salmon), {})).toBeNull();
  });
  it('says nothing ticked yet when limits exist but nothing is counted', () => {
    expect(view([salmon], {})).toEqual({ kind: 'none' });
  });
  it('shows only ingredients with a limit, not Creatine', () => {
    const m = view([salmon, creatine], ticked(salmon, creatine));
    expect(m).toMatchObject({ kind: 'rows', tracked: 2, hidden: 0 });
    if (m?.kind !== 'rows') throw new Error('rows');
    expect(m.subs.map(s => s.label)).toEqual(['Omega-3', 'EPA']);
  });
  it('names a cap as a percent and a target as a percent, then Met once reached', () => {
    const one = view([salmon], ticked(salmon));
    if (one?.kind !== 'rows') throw new Error('rows');
    expect(ingredientClosedLine(one.top)).toBe('Omega-3 67% · EPA 66%');
    const two = view([salmon, { ...salmon, id: 's2' }], ticked(salmon, { ...salmon, id: 's2' }));
    if (two?.kind !== 'rows') throw new Error('rows');
    expect(two.top.map(t => [t.label, t.text, t.status])).toEqual([['Omega-3', 'Over', 'over'], ['EPA', 'Met', 'met']]);
  });
  it('puts over first and keeps the bar full', () => {
    const s2 = { ...salmon, id: 's2' };
    const m = view([salmon, s2], ticked(salmon, s2));
    if (m?.kind !== 'rows') throw new Error('rows');
    expect(m.top[0]).toMatchObject({ label: 'Omega-3', status: 'over', percent: 100 });
    expect(ingredientClosedLine(m.top)).toBe('Omega-3 over · EPA Met');
    expect(m.top[0].name).toContain('Over your cap by 500 mg');
  });
  it('a target below its amount is not a warning status', () => {
    const m = view([salmon], ticked(salmon));
    if (m?.kind !== 'rows') throw new Error('rows');
    expect(m.top.find(t => t.label === 'EPA')?.status).toBe('under');
  });
});
