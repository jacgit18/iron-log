import { describe, expect, it } from 'vitest';
import { normSupplementItem } from '../src/shared/listItems.ts';
import { normDietEntries } from '../src/shared/diet.ts';
import { supplementNutrientTotals, targetTotals } from '../src/lib/supplementNutrients.ts';
import { dayNutrientMeter } from '../src/lib/dayNutrientMeter.ts';
import { weekAverages } from '../src/lib/intakeAverage.ts';
import { limitWarning, totalsView } from '../src/lib/supplementTotalsView.ts';
import { personaById } from '../server/qa/personas.ts';
import { buildPersonaRows } from '../server/qa/seedPlan.ts';

// The vitamin tracker's seed read through the app's own totals code. It lives here, not beside the seed, because server/ may import only src/shared/ (ADR 015) and the totals are in src/lib.
// If a figure here changes, the QA scenarios S-222 to S-237 (server/qa/scenarios.ts) quote it and need the same edit.
const day = '2026-10-27';
const rows = buildPersonaRows(personaById('vitamin-tracker')!, ['latpd'], new Date('2026-10-27T12:00:00Z'));
const items = rows.supplements.map(x => normSupplementItem(x.data)!);
const taken = Object.fromEntries(rows.supplementDays.map(d => [d.day, d.taken]));
const diet = normDietEntries(rows.dietEntries.map(e => e.data));
const eaten = diet.filter(e => e.d === day);

describe('the vitamin tracker seed, as the app totals it', () => {
  it('puts today in the states the scenarios walk: vitamin D over, zinc close, magnesium from supplements only, five without a limit', () => {
    const t = supplementNutrientTotals(items, taken, day, 'taken', eaten);
    const by = (k: string) => t.find(x => x.key === k)!;
    expect(by('vitaminD').total).toBe(125); // 125 mcg of supplement; today's foods (oatmeal, yogurt, chicken) carry no vitamin D
    expect(by('zinc')).toMatchObject({ fromSupplements: 30, fromFood: 6, total: 36 });
    expect(by('magnesium')).toMatchObject({ foodCounted: false, total: 200 });
    expect(limitWarning(items, taken, day, eaten)).toContain('Vitamin D');
    expect(targetTotals(items, taken, day, 'taken', eaten).map(x => x.key)).toEqual(expect.arrayContaining(['vitaminB12', 'fiber', 'potassium', 'sodium']));
  });
  it('says what scenarios S-222, S-224 and S-226 quote: the day line, the target lines and the 7-day averages', () => {
    const v = totalsView(items, taken, day, 'taken', eaten, undefined, weekAverages(items, taken, day, 'taken', diet));
    const row = (k: string) => v.rows.find(r => r.key === k)!;
    const m = dayNutrientMeter(v);
    expect(m).toMatchObject({ kind: 'rows', closed: 'Vitamin D over \u00b7 Zinc 90%', tracked: 7, hidden: 2 });
    expect(v.coverage).toContain('Food: 2 of 3 eaten foods');
    expect(row('calcium')).toMatchObject({ targetText: 'Below the recommended amount (82%)', averageText: '7-day average: 534.29 mg (7 days with data)' });
    expect(row('zinc')).toMatchObject({ statusText: 'Close to the limit (90%)', targetText: 'Above the recommended amount', averageText: '7-day average: 18.86 mg (7 days with data)' });
    expect(row('magnesium')).toMatchObject({ statusText: '57% of the limit', targetText: 'Meets the recommended amount', averageText: '7-day average: 171.43 mg from supplements (7 days with data)' });
    expect(v.targets.map(t => [t.label, t.statusText])).toEqual([['Potassium', 'Below the recommended range'], ['Vitamin B12', '20,867% of the recommended amount'], ['Fiber', 'Below the recommended range'], ['Sodium', '31% of the 2,300 mg level to stay under']]);
  });
});
