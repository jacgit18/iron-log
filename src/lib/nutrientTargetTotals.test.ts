import { describe, expect, it } from 'vitest';
import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { targetPosition, targetTotals } from './supplementNutrients.js';
import { GENERAL_INFO, limitWarning, totalsView } from './supplementTotalsView.js';

// Brief nutrients-without-upper-limit, PR 2 (ADR 108): the five nutrients without an upper limit are summed from supplements and food in full and read against a recommended amount in words;
// nothing here can be "over", and nothing here reaches the day's over-the-limit line.
const day = '2026-09-24';
const taken: Taken = { [day]: { a: true } };
const item = (nutrients: SupplementItem['nutrients']): SupplementItem => ({ id: 'a', n: 'Cap', slot: 'morning', nutrients });
const food = (id: string, micro: DietEntry['micro']): DietEntry => ({ id, d: day, n: `Food ${id}`, kcal: 100, p: 5, micro });

describe('targetTotals', () => {
  it('adds supplements and food in full, converts units (fiber in g from mg), and keeps the table order', () => {
    const t = targetTotals([item([{ key: 'fiber', amount: 2000, unit: 'mg' }, { key: 'vitaminB12', amount: 500, unit: 'mcg' }])], taken, day, 'taken', [food('1', { fiber: 3.5, sodium: 120, potassium: 400 }), food('2', { sodium: 80 })]);
    expect(t.map(x => x.key)).toEqual(['potassium', 'vitaminB12', 'fiber', 'sodium']);
    expect(t.find(x => x.key === 'fiber')).toMatchObject({ unit: 'g', fromSupplements: 2, fromFood: 3.5, total: 5.5 });
    expect(t.find(x => x.key === 'sodium')).toMatchObject({ unit: 'mg', fromSupplements: 0, fromFood: 200, total: 200 });
    expect(t.find(x => x.key === 'vitaminB12')).toMatchObject({ unit: 'mcg', total: 500 });
  });
  it('counts only what was ticked on the taken basis, and everything scheduled on the other', () => {
    const items = [item([{ key: 'potassium', amount: 99, unit: 'mg' }])];
    expect(targetTotals(items, {}, day, 'taken')).toEqual([]);
    expect(targetTotals(items, {}, day, 'scheduled')[0]).toMatchObject({ key: 'potassium', total: 99 });
  });
  it('lists an IU row it cannot convert with its reason, never guessed', () => {
    const [t] = targetTotals([item([{ key: 'vitaminK', amount: 100, unit: 'IU' }])], taken, day);
    expect(t).toMatchObject({ key: 'vitaminK', total: 0 });
    expect(t!.notAdded[0]!.reason).toContain('IU depends on the form');
  });
  it('places a total against the recommended range', () => {
    expect(targetPosition({ key: 'potassium', total: 2000 })).toBe('below');
    expect(targetPosition({ key: 'potassium', total: 3000 })).toBe('within');
    expect(targetPosition({ key: 'potassium', total: 3401 })).toBe('above');
    expect(targetPosition({ key: 'vitaminB12', total: 2.4 })).toBe('within');
  });
});

describe('the "No upper limit" rows', () => {
  it('say a share or a position in words, with the recommended range and the general-information line', () => {
    const v = totalsView([], {}, day, 'taken', [food('1', { potassium: 2000, vitaminB12: 1.2, fiber: 40 })]);
    const row = (k: string) => v.targets.find(r => r.key === k)!;
    expect(row('potassium')).toMatchObject({ figure: '2,000 mg', statusText: 'Below the recommended range' });
    expect(row('potassium').recommendedText).toBe(`Recommended 2,600 to 3,400 mg a day (Adequate Intake for adults 19 and over: 3,400 mg for men, 2,600 mg for women). ${GENERAL_INFO}`);
    expect(row('vitaminB12')).toMatchObject({ statusText: '50% of the recommended amount', percent: 50 });
    expect(totalsView([item([{ key: 'vitaminB12', amount: 500, unit: 'mcg' }])], taken, day, 'taken').targets[0]!.statusText).toBe('20,833% of the recommended amount'); // a common supplement dose reads with separators, still no warning
    expect(row('fiber')).toMatchObject({ figure: '40 g', statusText: 'Above the recommended range', percent: 100 });
  });
  it('reads sodium against the level to stay under, neutral either side of it', () => {
    const v = (mg: number) => totalsView([], {}, day, 'taken', [food('1', { sodium: mg })]).targets[0]!;
    expect(v(1150)).toMatchObject({ statusText: '50% of the 2,300 mg level to stay under', percent: 50 });
    expect(v(2800).statusText).toBe('Above the 2,300 mg level to stay under by 500 mg');
    expect(v(2800).recommendedText).toContain('Level to stay under: 2,300 mg a day.');
    expect(v(2800).scopeNote).toContain('not an upper limit');
  });
  it('are empty with no data, and never produce a limit row or a warning, even far above the recommended amount', () => {
    const big = [food('1', { potassium: 60000, sodium: 40000, fiber: 700, vitaminK: 2000, vitaminB12: 40 })];
    const v = totalsView([item([{ key: 'vitaminB12', amount: 5000, unit: 'mcg' }])], taken, day, 'taken', big);
    expect(v.rows).toEqual([]);
    expect(v.targets).toHaveLength(5);
    expect(limitWarning([item([{ key: 'vitaminB12', amount: 5000, unit: 'mcg' }])], taken, day, big)).toBe('');
    expect(totalsView([], {}, day, 'taken').targets).toEqual([]);
  });
  it('a day with only a target nutrient is data, not an empty state', () => {
    const v = totalsView([item([{ key: 'potassium', amount: 50, unit: 'mg' }])], taken, day, 'taken');
    expect(v).toMatchObject({ hasData: true, noneCounted: false });
    expect(v.targets).toHaveLength(1);
  });
});
