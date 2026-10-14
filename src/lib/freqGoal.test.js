import { describe, it, expect } from 'vitest';
import { sessionsInWeek, freqGoalStatus, avgPerTrainingDay } from './freqGoal.js';

// Week of Sun 2026-09-20 to Sat 2026-09-26.
const e = d => ({ d, w: 100, s: 3, r: 8 });

describe('sessionsInWeek', () => {
  it('counts the days with an entry in that week, a day once', () => {
    const L = [e('2026-09-19'), e('2026-09-20'), e('2026-09-20'), e('2026-09-22'), { ...e('2026-09-24'), auto: true }, e('2026-09-27')];
    expect(sessionsInWeek(L, '2026-09-20')).toBe(3);
  });
  it('counts a check-off on the board day of its card, not the day it was tapped', () => {
    // Mon, Wed and Fri cards all ticked on Friday: three entries dated Fri, on columns 1, 3 and 5.
    const L = ['a', 'b', 'c'].map(s => ({ ...e('2026-09-25'), auto: true, slot: s }));
    const col = { a: 1, b: 3, c: 5 };
    expect(sessionsInWeek(L, '2026-09-20')).toBe(1);
    expect(sessionsInWeek(L, '2026-09-20', s => col[s] ?? null)).toBe(3);
  });
  it('counts a logged set and a check-off of the same board day once, and falls back to the date without a slot', () => {
    const L = [{ ...e('2026-09-22'), slot: 'a' }, { ...e('2026-09-25'), auto: true, slot: 'a' }, e('2026-09-23'), { ...e('2026-09-24'), slot: 'gone' }];
    expect(sessionsInWeek(L, '2026-09-20', s => (s === 'a' ? 3 : null))).toBe(3);
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
    expect(avgPerTrainingDay([{ dayDone: [5, 3, 0, 0, 4, 0, 0] }, { dayDone: [3, 0, 0, 0, 0, 0, 0] }])).toBeCloseTo(3.75);
  });
  it('counts only what is done on the seven days, so overflow cards cannot raise it', () => {
    expect(avgPerTrainingDay([{ dayDone: [2, 0, 2, 0, 0, 0, 0] }])).toBe(2);
  });
  it('is null when nothing was done', () => {
    expect(avgPerTrainingDay([{ dayDone: [0, 0, 0, 0, 0, 0, 0] }])).toBeNull();
    expect(avgPerTrainingDay([])).toBeNull();
  });
});
