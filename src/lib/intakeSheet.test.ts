import { describe, expect, it } from 'vitest';
import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { weekAverages } from './intakeAverage.js';
import { totalsView } from './supplementTotalsView.js';

// Brief intake-target-and-safety-checks, PR 2: separate target and limit wording, the 7-day average and its words. Zinc: limit 40 mg (food counts), recommended 8 to 11 mg.
const day = '2026-09-24';
const zinc = (mg: number): SupplementItem => ({ id: 'z', n: 'Zinc cap', slot: 'morning', nutrients: [{ key: 'zinc', amount: mg, unit: 'mg' }] });
const mag = (mg: number): SupplementItem => ({ id: 'm', n: 'Mag cap', slot: 'morning', nutrients: [{ key: 'magnesium', amount: mg, unit: 'mg' }] });
const took = (items: SupplementItem[], days: string[]): Taken => Object.fromEntries(days.map(d => [d, Object.fromEntries(items.map(i => [i.id, true as const]))]));
const food = (d: string, micro: DietEntry['micro']): DietEntry => ({ id: `f${d}`, d, n: 'Beans', kcal: 100, p: 5, ...(micro ? { micro } : {}) });
const row = (v: ReturnType<typeof totalsView>, key: string) => v.rows.find(r => r.key === key)!;

describe('the target check is its own line', () => {
  it('has no verdict until a food with vitamin or mineral data is logged', () => {
    const items = [zinc(5)];
    expect(row(totalsView(items, took(items, [day]), day, 'taken', []), 'zinc').targetText).toBe('');
    expect(row(totalsView(items, took(items, [day]), day, 'taken', [food(day, undefined)]), 'zinc').targetText).toBe('');
  });
  it('says below, meets or above the recommended amount from food plus supplements, and never mentions the limit', () => {
    const items = [zinc(5)];
    const t = (mg: number) => row(totalsView(items, took(items, [day]), day, 'taken', [food(day, { zinc: mg })]), 'zinc').targetText;
    expect(t(1)).toBe('Below the recommended amount (75%)'); // 6 of 8 mg
    expect(t(4)).toBe('Meets the recommended amount'); // 9 mg, within 8 to 11
    expect(t(10)).toBe('Above the recommended amount'); // 15 mg
    for (const mg of [1, 4, 10]) expect(t(mg)).not.toMatch(/limit|\d+ mg/);
  });
  it('counts food for the target even where the limit does not count food (magnesium: food 400 mg, supplement 0)', () => {
    const items = [mag(1)];
    const r = row(totalsView(items, took(items, [day]), day, 'taken', [food(day, { magnesium: 400 })]), 'magnesium');
    expect(r.targetText).toBe('Meets the recommended amount'); // 401 mg against 310 to 420
    expect(r.status).toBe('under'); // the limit counts supplements only: 1 of 350 mg
    expect(r.statusText).toBe('0% of the limit');
  });
  it('uses a profile\'s own recommended amount', () => {
    const items = [zinc(5)];
    const r = row(totalsView(items, took(items, [day]), day, 'taken', [food(day, { zinc: 4 })], { birthYear: 1990, sex: 'male' }), 'zinc');
    expect(r.targetText).toBe('Below the recommended amount (82%)'); // 9 of 11 mg for men
  });
});

describe('7-day average', () => {
  const items = [zinc(10)];
  const days = ['2026-09-18', '2026-09-20', '2026-09-22', day];
  it('averages the days that have data among the 7 ending on the viewed day, and says how many', () => {
    const taken = took(items, days);
    const avg = weekAverages(items, taken, day, 'taken', []);
    expect(avg.limits.get('zinc')).toEqual({ average: 10, days: 4 });
    expect(row(totalsView(items, taken, day, 'taken', [], undefined, avg), 'zinc').averageText).toBe('7-day average: 10 mg (4 days with data)');
  });
  it('a day with no data is skipped, never counted as zero, and food counts on its own day', () => {
    const taken = took(items, ['2026-09-23', day]);
    const diet = [food('2026-09-23', { zinc: 10 }), food('2026-09-10', { zinc: 99 })]; // 09-10 is outside the window
    expect(weekAverages(items, taken, day, 'taken', diet).limits.get('zinc')).toEqual({ average: 15, days: 2 }); // (10+10) on the 23rd, 10 on the 24th
  });
  it('the days are the 7 ending on the viewed day, and one day reads "1 day"', () => {
    const avg = weekAverages(items, took(items, ['2026-09-17']), day, 'taken', []); // 7 days back is the 18th: the 17th is out
    expect(avg.limits.size).toBe(0);
    const one = weekAverages(items, took(items, [day]), day, 'taken', []);
    expect(row(totalsView(items, took(items, [day]), day, 'taken', [], undefined, one), 'zinc').averageText).toBe('7-day average: 10 mg (1 day with data)');
  });
  it('no averages given means no line, and the five without a limit get one too', () => {
    expect(row(totalsView(items, took(items, [day]), day, 'taken', []), 'zinc').averageText).toBe('');
    const k: SupplementItem = { id: 'k', n: 'K', slot: 'morning', nutrients: [{ key: 'potassium', amount: 1000, unit: 'mg' }] };
    const avg = weekAverages([k], took([k], [day]), day, 'taken', []);
    expect(totalsView([k], took([k], [day]), day, 'taken', [], undefined, avg).targets[0]!.averageText).toBe('7-day average: 1,000 mg (1 day with data)');
  });
});

describe('copy', () => {
  it('no sentence the sheet builds makes a claim about the body, however the day goes', () => {
    const items = [zinc(60), mag(500)];
    const texts: string[] = [];
    for (const eaten of [[], [food(day, { zinc: 40, magnesium: 100 })]]) {
      const v = totalsView(items, took(items, [day]), day, 'taken', eaten, { birthYear: 1990, sex: 'female' }, weekAverages(items, took(items, [day]), day, 'taken', eaten));
      v.rows.forEach(r => texts.push(r.statusText, r.targetText, r.averageText, r.recommendedText, r.limitText));
    }
    for (const t of texts) expect(t, t).not.toMatch(/too much|\bsafe\b|danger|toxic|healthy|harm|your body|you are fine/i);
  });
});
