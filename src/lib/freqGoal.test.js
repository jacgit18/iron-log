import { describe, it, expect } from 'vitest';
import { sessionsInWeek, freqGoalStatus, avgPerTrainingDay } from './freqGoal.js';

// Week of Sun 2026-09-20 to Sat 2026-09-26.
const e = d => ({ d, w: 100, s: 3, r: 8 });

describe('sessionsInWeek', () => {
  it('counts the days with an entry in that week, a day once', () => {
    const L = [e('2026-09-19'), e('2026-09-20'), e('2026-09-20'), e('2026-09-22'), { ...e('2026-09-24'), auto: true }, e('2026-09-27')];
    expect(sessionsInWeek(L, '2026-09-20')).toBe(3);
  });
  it('is 0 with no log', () => {
    expect(sessionsInWeek(undefined, '2026-09-20')).toBe(0);
    expect(sessionsInWeek([], '2026-09-20')).toBe(0);
  });
});

describe('freqGoalStatus', () => {
  it('measures each goal against this week, unmet goals first', () => {
    const cfg = { freqGoals: { sq: 2, bench: 3, row: 1 } };
    const logs = { sq: [e('2026-09-20'), e('2026-09-22')], bench: [e('2026-09-21')] };
    expect(freqGoalStatus(cfg, logs, '2026-09-20')).toEqual([
      { id: 'bench', goal: 3, done: 1, met: false },
      { id: 'row', goal: 1, done: 0, met: false },
      { id: 'sq', goal: 2, done: 2, met: true },
    ]);
  });
  it('is empty with no goals', () => {
    expect(freqGoalStatus({}, {}, '2026-09-20')).toEqual([]);
  });
});

describe('avgPerTrainingDay', () => {
  it('divides exercises done by the days that had any', () => {
    expect(avgPerTrainingDay([{ days: [2, 1, 0, 0, 2, 0, 0], ex: 12 }, { days: [2, 0, 0, 0, 0, 0, 0], ex: 3 }])).toBeCloseTo(3.75);
  });
  it('is null when nothing was done', () => {
    expect(avgPerTrainingDay([{ days: [0, 0, 0, 0, 0, 0, 0], ex: 0 }])).toBeNull();
    expect(avgPerTrainingDay([])).toBeNull();
  });
});
