import { describe, expect, it } from 'vitest';
import { entryAtPortion, entryPortion, portionTotalsAt, stepEntryPortion } from './dietPortion.js';
import type { DietEntry } from '../types.ts';

const e = (o: Partial<DietEntry> = {}): DietEntry => ({ id: 'e1', d: '2026-11-14', n: 'Rice', kcal: 520, p: 42, c: 60, f: 12, ...o });

describe('entryAtPortion: the entry\'s own numbers scaled by new count over old count', () => {
  it('an entry with no count reads as 1 and doubles at 2', () => {
    expect(entryPortion(e())).toBe(1);
    expect(entryAtPortion(e(), 2)).toEqual(e({ kcal: 1040, p: 84, c: 120, f: 24, x: 2 }));
  });
  it('uses the stored count as the base, not 1', () => {
    expect(entryAtPortion(e({ kcal: 780, p: 63, c: 90, f: 18, x: 1.5 }), 1)).toMatchObject({ kcal: 520, p: 42, c: 60, f: 12, x: 1 });
  });
  it('scales micro and drops nothing; leaves out carbs and fat the entry never had', () => {
    const r = entryAtPortion(e({ c: undefined, f: undefined, micro: { calcium: 100 } }), 1.5)!;
    expect(r.micro).toEqual({ calcium: 150 });
    expect('c' in r).toBe(false); expect('f' in r).toBe(false);
  });
  it('keeps other fields (id, day, name, from, hour)', () => {
    expect(entryAtPortion(e({ from: 'r1', t: 9 }), 2)).toMatchObject({ id: 'e1', d: '2026-11-14', n: 'Rice', from: 'r1', t: 9 });
  });
});

describe('limits', () => {
  it('the limit is the Edit sheet\'s (10), and a count scales by what is stored (two decimals)', () => {
    expect(entryAtPortion(e({ kcal: 10, p: 1 }), 10.5)).toBeNull();
    expect(entryAtPortion(e({ kcal: 10, p: 1 }), 10)).not.toBeNull();
    expect(entryAtPortion(e({ kcal: 300 }), 1.333)).toMatchObject({ kcal: 399, x: 1.33 });
  });
  it('refuses a step that would drop an amount over its cap', () => {
    expect(entryAtPortion(e({ micro: { calcium: 15000 } }), 2)).toBeNull();
    expect(entryAtPortion(e({ micro: { calcium: 100 } }), 2)).not.toBeNull();
  });
  it('refuses below half a portion and above the limit', () => {
    expect(entryAtPortion(e(), 0.25)).toBeNull();
    expect(entryAtPortion(e(), 3, 2.5)).toBeNull();
    expect(entryAtPortion(e(), 2.5, 2.5)).not.toBeNull();
    expect(entryAtPortion(e({ kcal: 10, p: 1 }), 100)).toBeNull();
    expect(entryAtPortion(e(), NaN)).toBeNull();
  });
  it('never makes calories above 9,999', () => {
    const big = e({ kcal: 2000, p: 10, c: undefined, f: undefined });
    expect(portionTotalsAt(big, 5)).toBeNull(); // 10,000 kcal
    expect(portionTotalsAt(big, 4.5)!.kcal).toBe(9000);
  });
  it('Less stops at 0.5 and More at the ceiling', () => {
    expect(stepEntryPortion(e({ x: 0.5 }), -1)).toBeNull();
    expect(stepEntryPortion(e({ x: 1 }), -1)).toBe(0.5);
    expect(stepEntryPortion(e({ x: 1 }), 1)).toBe(1.5);
    expect(stepEntryPortion(e(), 1, 1)).toBeNull();
    expect(stepEntryPortion(e({ kcal: 9000, p: 10, x: 4.5 }), 1)).toBeNull();
  });
});

describe('rounding rule: Less then More returns the starting numbers within 1 kcal', () => {
  it('holds for whole kcal from 1 to 3000 (every 7th, plus the edges) and every half step, from either direction', () => {
    let worst = 0; // the largest gap seen, asserted once (60,000 expects would be slow)
    const gap = (start: DietEntry, to: number | null, x: number) => {
      if (to === null) return;
      const back = entryAtPortion(entryAtPortion(start, to)!, x)!;
      worst = Math.max(worst, Math.abs(back.kcal - start.kcal));
    };
    for (let kcal = 1; kcal <= 3000; kcal += kcal === 1 ? 6 : 7) {
      for (let x = 0.5; x <= 10; x += 0.5) {
        const start = e({ kcal: Math.round(kcal * x) || 1, p: 10, c: undefined, f: undefined, x });
        if (start.kcal >= 9999) continue; // at the cap itself, coming back up can round to 10,000, which More refuses (the cap wins)
        gap(start, stepEntryPortion(start, -1), x);
        gap(start, stepEntryPortion(start, 1), x);
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
  it('a run of Less and More taps drifts by at most 1 kcal per tap', () => {
    let cur = e({ kcal: 521 });
    for (let tap = 1; tap <= 10; tap++) {
      cur = entryAtPortion(cur, stepEntryPortion(cur, tap % 2 ? -1 : 1)!)!;
      expect(Math.abs(cur.kcal - 521 * entryPortion(cur))).toBeLessThanOrEqual(tap);
    }
  });
  it('a worked case: 521 kcal at 1 portion, Less then More', () => {
    const less = entryAtPortion(e({ kcal: 521 }), 0.5)!;
    expect(less.kcal).toBe(261);
    expect(entryAtPortion(less, 1)!.kcal).toBe(522);
  });
});
