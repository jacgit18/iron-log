import { describe, expect, it } from 'vitest';
import { currentMax, estimateMax, liftsOf, phaseRows } from './oneRepMax.js';
import type { LogEntry } from '../types.ts';

const e = (ph: LogEntry['ph'], w: number, r: number, sets?: { w: number; r: number }[]): LogEntry => ({ d: '2026-10-01', ph, w, r, ...(sets ? { sets } : {}) });

describe('estimateMax', () => {
  it('is weight x (1 + reps / 30) from the best set, rounded', () => {
    expect(estimateMax([e('strength', 245, 5)])).toMatchObject({ value: 286, from: { w: 245, r: 5 } });
  });

  it('ignores sets over 10 reps, which the formula overstates', () => {
    expect(estimateMax([e('hyp', 185, 12)])).toBeNull();
    expect(estimateMax([e('hyp', 185, 12), e('strength', 245, 5)])?.value).toBe(286);
  });

  it('reads each set of an entry that has them, not only the summary', () => {
    const entry = e('strength', 225, 5, [{ w: 225, r: 5 }, { w: 245, r: 3 }]);
    expect(estimateMax([entry])?.from).toMatchObject({ w: 245, r: 3 });
  });

  it('takes the heavier lift when two give the same estimate, and returns null for nothing usable', () => {
    expect(estimateMax([e(null, 200, 1)])?.value).toBe(207);
    expect(estimateMax([])).toBeNull();
    expect(estimateMax(null)).toBeNull();
    expect(estimateMax([{ d: '2026-10-01', ph: 'iso', sec: 30 }])).toBeNull(); // a timed hold has no weight or reps
  });
});

describe('currentMax', () => {
  it('prefers a typed value and keeps the estimate beside it', () => {
    expect(currentMax(315, [e('strength', 275, 3)])).toEqual({ value: 315, source: 'tested', from: null, estimate: 303 });
  });

  it('falls back to the estimate, and to null without logs', () => {
    expect(currentMax(null, [e('strength', 245, 5)])).toMatchObject({ value: 286, source: 'estimated' });
    expect(currentMax(undefined, [])).toBeNull();
    expect(currentMax(0, [])).toBeNull();
  });
});

describe('phaseRows', () => {
  it('gives each phase its best set, the percent of the max, the target and the difference', () => {
    const rows = phaseRows([e('strength', 245, 5), e('hyp', 185, 12)], 286, { pct: {} });
    expect(rows).toEqual([
      { ph: 'strength', w: 245, r: 5, pct: 86, target: 85, diff: 1 },
      { ph: 'hyp', w: 185, r: 12, pct: 65, target: 65, diff: 0 },
    ]);
  });

  it('uses the person\'s own target percent and has no percent without a max', () => {
    expect(phaseRows([e('strength', 245, 5)], 286, { pct: { strength: 90 } })[0]).toMatchObject({ target: 90, diff: -4 });
    expect(phaseRows([e('strength', 245, 5)], null, { pct: {} })[0]).toMatchObject({ pct: null, diff: null });
  });

  it('leaves a phase with no share (Mobility) without a target', () => {
    expect(phaseRows([e('mob', 20, 10)], 100, { pct: {} })[0]).toMatchObject({ target: null, diff: null });
  });
});

describe('liftsOf', () => {
  it('skips entries with no weight or no reps', () => {
    expect(liftsOf([{ d: '2026-10-01', w: 0, r: 5 }, { d: '2026-10-01', w: 50 }])).toEqual([]);
  });
});
