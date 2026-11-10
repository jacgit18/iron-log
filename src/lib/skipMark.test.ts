import { describe, expect, it } from 'vitest';
import { describe as describeEntry } from './logic.js';
import { sessionsInWeek } from './freqGoal.js';
import { newestFirst } from './exerciseOrder.js';
import { hasProgressData } from './progressPage.js';
import { isSkipMark, withoutSkipMarks } from './skipMark.js';
import { setsByWeek } from './trends.js';
import type { LogEntry } from '../types.ts';

const mark = { id: 'L1', d: '2026-09-22', ph: 'hyp', slot: 'A-d3s1', wk: '2026-09-20', auto: true, n: 'Skipped' } as LogEntry;
const real = { id: 'L2', d: '2026-09-21', ph: 'hyp', w: 100, s: 3, r: 8, slot: 'A-d3s1', wk: '2026-09-20' } as LogEntry;
const tick = { id: 'L3', d: '2026-09-21', ph: 'hyp', w: 100, s: 3, r: 8, slot: 'A-d3s1', wk: '2026-09-20', auto: true } as LogEntry;

describe('a Skipped entry is not a session', () => {
  it('is recognised only when it is an auto entry noted Skipped', () => {
    expect([isSkipMark(mark), isSkipMark(tick), isSkipMark(real), isSkipMark({ ...real, n: 'Skipped' })]).toEqual([true, false, false, false]);
  });
  it('drops from the logs, and an exercise with nothing else drops out', () => {
    expect(withoutSkipMarks({ a: [mark], b: [real, mark] })).toEqual({ b: [real] });
  });
  it('reads Skipped, not "? x ?"', () => expect(describeEntry(mark)).toBe('Skipped'));
  it('adds no session to the weekly count, and no day to a frequency goal', () => {
    expect(setsByWeek({ a: [mark, real] }, ['2026-09-20'])['2026-09-20']).toEqual({ sets: 3, sessions: 1 });
    expect(sessionsInWeek([mark], '2026-09-20')).toBe(0);
    expect(sessionsInWeek([mark, real], '2026-09-20')).toBe(1);
  });
  it('is not the newest session, and an exercise with only skips is not listed', () => {
    const logs = { a: [real, mark], b: [{ ...real, d: '2026-09-21' }] };
    expect(newestFirst(['a', 'b', 'c'], { ...logs, c: [mark] }, id => id)).toEqual(['a', 'b']);
  });
  it('is not progress data on its own', () => expect(hasProgressData({ a: [mark] }, 0)).toBe(false));
});
