import { describe, expect, it } from 'vitest';
import { GENERAL_INFO } from './supplementTotalsView.js';
import { CLOSE_FRACTION, INTAKE_DISCLAIMER, rollingAverage, safetyCheck, targetCheck } from './intakeChecks.js';
import { limitOf } from './nutrientLimits.js';
import { limitStatus } from './supplementNutrients.js';

// Brief intake-target-and-safety-checks, PR 1: the two checks are separate, the safety check reads the limit's scope, and the owner's cases hold. Magnesium: limit 350 mg (supplements only), recommended 310 to 420 mg.
const mag = limitOf('magnesium')!;
const magRef = { upper: mag.upper, scope: mag.scope };

describe('the owner\'s cases (magnesium)', () => {
  it('400 mg in all with 380 mg from supplements is over the limit', () => {
    const a = { fromFood: 20, fromSupplements: 380 };
    expect(safetyCheck(a, magRef)).toMatchObject({ status: 'over', counted: 380, over: 30 });
    expect(targetCheck(a, mag.recommended)).toMatchObject({ status: 'meets', met: true });
  });
  it('200 mg from food plus 300 mg from a supplement is under the limit (approaching, not over) and meets the target', () => {
    const a = { fromFood: 200, fromSupplements: 300 };
    expect(safetyCheck(a, magRef)).toMatchObject({ status: 'approaching', counted: 300, percent: 86, over: 0 });
    expect(targetCheck(a, mag.recommended)).toMatchObject({ status: 'above', total: 500, met: true }); // met, and above the highest recommended figure (420): a separate fact from the limit
  });
  it('450 mg all from food: the limit counts supplements only, so the safety check is under, and the target is met', () => {
    const a = { fromFood: 450, fromSupplements: 0 };
    expect(safetyCheck(a, magRef)).toMatchObject({ status: 'under', counted: 0, percent: 0 });
    expect(targetCheck(a, mag.recommended)).toMatchObject({ status: 'above', met: true });
    expect(targetCheck({ fromFood: 450, fromSupplements: 0 }, { min: 310, max: 500 }).status).toBe('meets');
  });
});

describe('safetyCheck follows the scope', () => {
  const food = { fromFood: 100, fromSupplements: 50 };
  it('total counts food and supplements; supplements and form count supplements only', () => {
    expect(safetyCheck(food, { upper: 120, scope: 'total' })).toMatchObject({ status: 'over', counted: 150, over: 30 });
    expect(safetyCheck(food, { upper: 120, scope: 'supplements' })).toMatchObject({ status: 'under', counted: 50 });
    expect(safetyCheck(food, { upper: 120, scope: 'form' })).toMatchObject({ status: 'under', counted: 50 });
  });
  it('exactly the limit is not over; approaching starts at CLOSE_FRACTION of it', () => {
    expect(safetyCheck({ fromFood: 0, fromSupplements: 350 }, magRef)).toMatchObject({ status: 'approaching', over: 0, percent: 100 });
    expect(safetyCheck({ fromFood: 0, fromSupplements: 350 * CLOSE_FRACTION }, magRef).status).toBe('approaching');
    expect(safetyCheck({ fromFood: 0, fromSupplements: 350 * CLOSE_FRACTION - 1 }, magRef).status).toBe('under');
    expect(CLOSE_FRACTION).toBe(0.8);
  });
  it('a missing or null limit is none: no percent, never 0 or 100%', () => {
    for (const upper of [undefined, null, 0]) expect(safetyCheck(food, { upper, scope: 'total' })).toEqual({ status: 'none', counted: 150, over: 0 });
  });
  it('agrees with the status the sheet already shows for every limit', () => {
    for (const amount of [0, 100, 279, 280, 350, 351, 1000]) {
      const sheet = limitStatus({ key: 'magnesium', total: amount });
      const check = safetyCheck({ fromFood: 0, fromSupplements: amount }, magRef);
      expect({ status: check.status === 'approaching' ? 'close' : check.status, percent: check.percent, over: check.over }, String(amount)).toEqual(sheet);
    }
  });
});

describe('targetCheck is its own answer', () => {
  it('below, meets and above the recommended range, from food plus supplements; none without a recommended amount', () => {
    expect(targetCheck({ fromFood: 100, fromSupplements: 100 }, { min: 310, max: 420 })).toMatchObject({ status: 'below', total: 200, percent: 65, met: false });
    expect(targetCheck({ fromFood: 200, fromSupplements: 150 }, { min: 310, max: 420 }).status).toBe('meets');
    expect(targetCheck({ fromFood: 300, fromSupplements: 150 }, { min: 310, max: 420 }).status).toBe('above');
    expect(targetCheck({ fromFood: 1, fromSupplements: 1 }, 2).status).toBe('meets');
    expect(targetCheck({ fromFood: 1, fromSupplements: 1 }).status).toBe('none');
    expect(targetCheck({ fromFood: 1, fromSupplements: 1 }, null).status).toBe('none');
  });
  it('says nothing about the limit in its result', () => {
    expect(Object.keys(targetCheck({ fromFood: 1, fromSupplements: 1 }, 2)).sort()).toEqual(['met', 'percent', 'status', 'total']);
  });
});

describe('rollingAverage', () => {
  it('averages the days that have data among the last seven, and says how many', () => {
    expect(rollingAverage([100, undefined, 200, undefined, undefined, 300, 400])).toEqual({ average: 250, days: 4 });
    expect(rollingAverage([10, 20])).toEqual({ average: 15, days: 2 });
  });
  it('uses only the last seven entries and returns nothing when no day has data', () => {
    expect(rollingAverage([1000, 10, 10, 10, 10, 10, 10, 10])).toEqual({ average: 10, days: 7 });
    expect(rollingAverage([undefined, undefined])).toBeUndefined();
    expect(rollingAverage([])).toBeUndefined();
  });
});

describe('copy', () => {
  it('the disclaimer names what it leaves out and no copy constant makes a claim about the body', () => {
    for (const w of ['pregnancy', 'breastfeeding', 'medicines', 'health conditions', 'not medical advice']) expect(INTAKE_DISCLAIMER).toContain(w);
    for (const text of [INTAKE_DISCLAIMER, GENERAL_INFO]) expect(text).not.toMatch(/too much|\bsafe\b|danger|toxic|healthy|harm/i);
  });
});
