import { describe, expect, it } from 'vitest';
import { amountTaken, fmtServings, milligramLines, normPortion, portionTag, portionText, snapPortion, stepOf, stepPortion } from './supplementPortion.js';

const caps2 = { units: 2, form: 'Capsule' };
const tab1 = { units: 1, form: 'Tablet' };

describe('normPortion', () => {
  it('keeps a number above 0 up to 10 with four decimals; one serving is "none"', () => {
    expect(normPortion(0.5)).toBe(0.5);
    expect(normPortion(2)).toBe(2);
    expect(normPortion(10)).toBe(10);
    expect(normPortion(1 / 3)).toBe(0.3333);
    expect(normPortion(1)).toBeUndefined();
    expect(normPortion(1.00001)).toBeUndefined();
  });
  it('drops anything that is not a usable number', () => {
    for (const bad of [0, -1, 10.1, 100, NaN, Infinity, '2', null, undefined, {}]) expect(normPortion(bad)).toBeUndefined();
  });
});

describe('the stepper', () => {
  it('moves one capsule per tap when the serving size is known, a quarter serving when it is not', () => {
    expect(stepOf(2)).toBe(0.5);
    expect(stepOf(3)).toBeCloseTo(1 / 3);
    expect(stepOf(undefined)).toBe(0.25);
    expect(stepPortion(1, -1, 2)).toBe(0.5);
    expect(stepPortion(0.5, 1, 2)).toBe(1);
    expect(stepPortion(1, 1, 2)).toBe(1.5);
    expect(stepPortion(0.25, 1, undefined)).toBe(0.5);
  });
  it('never goes below one step or above 10 servings', () => {
    expect(stepPortion(0.5, -1, 2)).toBe(0.5);
    expect(stepPortion(0.25, -1, undefined)).toBe(0.25);
    expect(stepPortion(10, 1, 2)).toBe(10);
    expect(stepPortion(9.75, 1, undefined)).toBe(10);
  });
  it('a third of a serving per capsule lands on four decimals, and three capsules are one serving', () => {
    expect(stepPortion(1, -1, 3)).toBe(0.6667);
    expect(snapPortion(stepPortion(1, -1, 3), 3)).toBe(0.6667);
    expect(stepPortion(0.6667, 1, 3)).toBe(1);
  });
  it('snaps a portion that no longer fits the serving size to the nearest capsule on the next tap', () => {
    expect(snapPortion(0.75, 2)).toBe(1); // 1.5 capsules of a 2-capsule serving
    expect(stepPortion(0.75, -1, 2)).toBe(0.5);
  });
});

describe('words', () => {
  it('says capsules, with the right plural, from the serving size', () => {
    expect(portionText(0.5, caps2)).toBe('1 capsule');
    expect(portionText(1, caps2)).toBe('2 capsules');
    expect(portionText(1.5, caps2)).toBe('3 capsules');
    expect(portionText(2, tab1)).toBe('2 tablets');
    expect(portionText(1, { units: 1 })).toBe('1 capsule');
  });
  it('says servings when the serving size is not known', () => {
    expect(portionText(0.5, undefined)).toBe('½ serving');
    expect(portionText(1.5, undefined)).toBe('1½ servings');
    expect(portionText(2, null)).toBe('2 servings');
  });
  it('writes fractions in words people use and long decimals short', () => {
    expect([0.25, 0.5, 0.75, 1.5, 2, 0.3333].map(fmtServings)).toEqual(['¼', '½', '¾', '1½', '2', '0.33']);
  });
  it('tags the day only when the intake is not exactly one serving', () => {
    expect(portionTag({ serving: caps2 })).toBe('');
    expect(portionTag({ portion: 1, serving: caps2 })).toBe('');
    expect(portionTag({ portion: 0.5, serving: caps2 })).toBe('1 capsule');
    expect(portionTag({ portion: 2, serving: tab1 })).toBe('2 tablets');
    expect(portionTag({ portion: 0.5 })).toBe('½ serving');
  });
});

describe('the amount under the stepper', () => {
  const mag = { amount: 200, unit: 'mg' };
  it('multiplies the per-serving amount and shows the working', () => {
    expect(amountTaken(mag, 0.5)).toBe(100);
    expect(milligramLines(mag, 'magnesium', 1.5, caps2).main).toBe('300 mg magnesium');
    expect(milligramLines(mag, 'magnesium', 1.5, caps2).detail).toContain('3 × 100 mg per capsule = 300 mg');
    expect(milligramLines(mag, 'magnesium', 1.5, caps2).detail).toContain('1½ servings');
    expect(milligramLines(mag, 'magnesium', 0.5, caps2).main).toBe('100 mg magnesium');
  });
  it('works in servings without a serving size', () => {
    const l = milligramLines(mag, 'magnesium', 0.5, undefined);
    expect(l.main).toBe('100 mg magnesium');
    expect(l.detail).toContain('200 mg per serving × ½ = 100 mg');
  });
  it('says what to add when there is no nutrient row', () => {
    expect(milligramLines(undefined, '', 1, caps2)).toEqual({ main: '', detail: 'Add what is in one serving to see the amount you take.' });
  });
});
