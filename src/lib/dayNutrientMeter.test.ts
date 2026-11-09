import { describe, expect, it } from 'vitest';
import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { dayNutrientMeter } from './dayNutrientMeter.js';
import { totalsView } from './supplementTotalsView.js';

// Brief vitamin-mineral-day-meter (layout B): the day's vitamin and mineral lines read the rows the Totals sheet draws, so these tests feed real supplements and foods through `totalsView`.
const day = '2026-09-24';
const item = (id: string, nutrients: NonNullable<SupplementItem['nutrients']>): SupplementItem => ({ id, n: `Item ${id}`, slot: 'morning', nutrients });
const all = (items: SupplementItem[]): Taken => ({ [day]: Object.fromEntries(items.map(i => [i.id, true as const])) });
const view = (items: SupplementItem[], taken: Taken = all(items), eaten: DietEntry[] = []) => dayNutrientMeter(totalsView(items, taken, day, 'taken', eaten));

const items = [
  item('d', [{ key: 'vitaminD', amount: 112, unit: 'mcg' }]), // limit 100 mcg: 112%, over
  item('z', [{ key: 'zinc', amount: 35, unit: 'mg' }]), // limit 40 mg: 88%, close
  item('m', [{ key: 'magnesium', amount: 217, unit: 'mg' }]), // limit 350 mg: 62%
];

describe('what is drawn', () => {
  it('nothing without data, and nothing for a day with only nutrients that have no limit', () => {
    expect(view([{ id: 'x', n: 'Plain', slot: 'morning' }])).toBeNull();
    expect(view([item('k', [{ key: 'potassium', amount: 900, unit: 'mg' }])])).toBeNull();
  });
  it('says nothing ticked yet when supplements list nutrients but none is counted', () => {
    expect(view(items, {})).toEqual({ kind: 'none' });
  });
  it('names the two nearest their limits, over first, in words as well as figures', () => {
    const m = view(items);
    expect(m).toMatchObject({ kind: 'rows', closed: 'Vitamin D over · Zinc 88%', tracked: 3, hidden: 0 });
    if (m?.kind !== 'rows') throw new Error('rows');
    expect(m.top.map(t => [t.label, t.text, t.status])).toEqual([['Vitamin D', 'Over', 'over'], ['Zinc', '88%', 'close']]);
    expect(m.subs.map(s => [s.label, s.text, s.percent])).toEqual([['Vitamin D', 'Over', 100], ['Zinc', '88%', 88], ['Magnesium', '62%', 62]]);
    expect(m.subs[0]!.name).toBe('Vitamin D: 112 mcg. Over the limit by 12 mcg. Limit 100 mcg');
  });
});

describe('ranking', () => {
  it('shows five bars and counts the rest as hidden', () => {
    const many = ['calcium', 'copper', 'iodine', 'iron', 'zinc', 'selenium', 'vitaminC'].map(k => item(k, [{ key: k as 'calcium', amount: 1, unit: 'mg' }]));
    const m = view(many);
    if (m?.kind !== 'rows') throw new Error('rows');
    expect(m).toMatchObject({ tracked: 7, hidden: 2 });
    expect(m.subs).toHaveLength(5);
  });
  it('a tie keeps the limits table\'s order, and exactly the limit is 100% and not over', () => {
    const m = view([item('a', [{ key: 'zinc', amount: 40, unit: 'mg' }]), item('b', [{ key: 'iron', amount: 45, unit: 'mg' }])]);
    if (m?.kind !== 'rows') throw new Error('rows');
    expect(m.top.map(t => [t.label, t.text, t.status])).toEqual([['Iron', '100%', 'close'], ['Zinc', '100%', 'close']]); // iron before zinc in the table
  });
});

describe('food counts as the sheet counts it', () => {
  const eaten: DietEntry[] = [{ id: 'e', d: day, n: 'Oysters', kcal: 100, p: 10, micro: { zinc: 10, magnesium: 400 } }];
  it('food raises a limit that counts food (zinc 35 + 10 is over) and not one that counts supplements only (magnesium stays 62%)', () => {
    const m = view(items, all(items), eaten);
    if (m?.kind !== 'rows') throw new Error('rows');
    expect(m.top.map(t => [t.label, t.status])).toEqual([['Zinc', 'over'], ['Vitamin D', 'over']]); // zinc 113% (45 of 40) ranks above vitamin D 112%
    expect(m.subs.find(s => s.label === 'Magnesium')!.text).toBe('62%');
  });
  it('a day with food data and nothing ticked still has a line', () => {
    const m = view(items, {}, eaten);
    expect(m).toMatchObject({ kind: 'rows' });
  });
});
