import { describe, it, expect } from 'vitest';
import { bestLift, liftGoalStatus, liftGoalsStatus, liftGoalNote, scaledGoal, suggestedMultiplier, goalFromMultiplier, multiplierOf } from './liftGoal.js';

const logs = [
  { d: '2026-09-07', ph: 'strength', w: 185, s: 3, r: 5 },
  { d: '2026-09-14', ph: 'hyp', w: 160, s: 3, r: 10, sets: [{ w: 160, r: 10 }, { w: 200, r: 3 }] },
  { d: '2026-09-21', ph: 'strength', w: 250, s: 4, r: 5, auto: true }, // planned numbers from a check-off
];
const today = new Date(2026, 9, 2);

describe('lift weight goal', () => {
  it('finds the heaviest logged set in any phase, ignoring check-offs', () => {
    expect(bestLift(logs)).toEqual({ w: 200, d: '2026-09-14' });
    expect(bestLift([])).toBeNull();
  });
  it('finds the heaviest set in one phase', () => {
    expect(bestLift(logs, 'strength')).toEqual({ w: 185, d: '2026-09-07' });
    expect(bestLift(logs, 'exp')).toBeNull();
  });
  it('works out what is left and progress from where you started', () => {
    expect(liftGoalStatus({ w: 225, start: 175 }, logs, today)).toMatchObject({ now: 200, left: 25, reached: false, pct: 50 });
    expect(liftGoalStatus({ w: 225, start: 175 }, logs, today, 'strength')).toMatchObject({ now: 185, left: 40, pct: 20 });
  });
  it('a goal on an exercise with no log starts at 0 and has nothing to show yet', () => {
    expect(liftGoalStatus({ w: 100, start: 0 }, [], today)).toMatchObject({ best: null, now: null, left: 100, reached: false, pct: 0 });
    expect(liftGoalStatus({ w: 100, start: 0 }, logs.slice(0, 1), today)).toMatchObject({ now: 185, reached: true, pct: 100 });
  });
  it('gives the weekly gain needed to hit a date', () => {
    const g = liftGoalStatus({ w: 225, start: 175, by: '2026-11-01' }, logs, today);
    expect(g.weeksLeft).toBeCloseTo(30 / 7, 1);
    expect(g.need).toBeCloseTo(25 / (30 / 7), 1);
  });
  it('knows when it is reached', () => {
    expect(liftGoalStatus({ w: 200, start: 185 }, logs, today)).toMatchObject({ reached: true, pct: 100 });
    expect(liftGoalStatus({ w: 200, start: 185 }, logs, today, 'strength')).toMatchObject({ reached: false });
  });
  it('handles no goal and no sets', () => {
    expect(liftGoalStatus(null, logs, today)).toBeNull();
    expect(liftGoalStatus({ w: 100, start: 0 }, [], today)).toMatchObject({ best: null, left: 100, reached: false, pct: 0 });
  });
  it('lists the goals a phase counts toward', () => {
    const cfg = { liftGoals: { bench: { hyp: { w: 180, start: 160 }, any: { w: 225, start: 185 }, strength: { w: 205, start: 185 } } } };
    expect(liftGoalsStatus(cfg, 'bench', logs, today).map(g => g.key)).toEqual(['any', 'strength', 'hyp']);
    expect(liftGoalsStatus(cfg, 'bench', logs, today, 'strength').map(g => g.key)).toEqual(['any', 'strength']);
    expect(liftGoalsStatus(cfg, 'bench', logs, today, null).map(g => g.key)).toEqual(['any']);
    expect(liftGoalNote(liftGoalsStatus(cfg, 'bench', logs, today)[1])).toBe('Goal 205 lb (Strength) · 20 lb to go');
    expect(liftGoalNote(liftGoalsStatus(cfg, 'bench', logs, today)[2])).toBe('Goal 180 lb (Hypertrophy) · reached');
  });
});

describe('a goal that scales with body weight', () => {
  const g = { w: 300, start: 0, bw: 120, bwd: '2026-09-01' };
  const body = (...ws) => ws.map(([d, w]) => ({ wk: d, d, w }));
  it('rises in proportion to body weight: 300 lb at 120 is 375 lb at 150', () => {
    expect(scaledGoal(g, body(['2026-09-08', 150])).w).toBe(375);
  });
  it('stays put when body weight drops, and when it comes back up short of the high', () => {
    expect(scaledGoal(g, body(['2026-09-08', 150], ['2026-10-01', 135])).w).toBe(375);
    expect(scaledGoal(g, body(['2026-09-08', 150], ['2026-10-01', 135], ['2026-10-15', 140])).w).toBe(375);
    expect(scaledGoal(g, body(['2026-09-08', 150], ['2026-10-15', 160])).w).toBe(400);
  });
  it('moves in steps of 5 lb, not 1 to 4', () => {
    expect(scaledGoal(g, body(['2026-09-08', 122])).w).toBe(305); // 305
    expect(scaledGoal(g, body(['2026-09-08', 120.8])).w).toBe(300); // 301.9 rounds down to 300
    expect(scaledGoal({ w: 100, bw: 100, bwd: '2026-09-01' }, body(['2026-09-08', 103])).w).toBe(105);
  });
  it('is never below the base, ignores weights from before it was set, and leaves other goals alone', () => {
    expect(scaledGoal(g, body(['2026-08-01', 200])).w).toBe(300);
    expect(scaledGoal(g, []).w).toBe(300);
    const plain = { w: 225, start: 0 };
    expect(scaledGoal(plain, body(['2026-09-08', 200]))).toBe(plain);
  });
  it('feeds the status the scaled target', () => {
    expect(liftGoalStatus(scaledGoal(g, body(['2026-09-08', 150])), [], today)).toMatchObject({ target: 375 });
  });
});

describe('the multiplier', () => {
  it('suggests 1.5 for an upper body exercise and 2.5 for lower body, untagged or mobility', () => {
    expect(suggestedMultiplier({ p: ['chest'], s: ['triceps'] })).toBe(1.5);
    expect(suggestedMultiplier({ p: ['lats', 'upperback'] })).toBe(1.5);
    expect(suggestedMultiplier({ p: ['glutes'], s: ['hamstrings'] })).toBe(2.5);
    expect(suggestedMultiplier({ p: ['quads', 'glutes', 'frontdelt'] })).toBe(2.5);
    expect(suggestedMultiplier(null)).toBe(2.5);
    expect(suggestedMultiplier({ mob: true })).toBe(2.5);
  });
  it('turns a multiplier and a body weight into a goal in steps of 5, and back', () => {
    expect(goalFromMultiplier(2.5, 120)).toBe(300);
    expect(goalFromMultiplier(1.5, 183)).toBe(275); // 274.5
    expect(multiplierOf(300, 120)).toBe(2.5);
    expect(multiplierOf(275, 183)).toBe(1.5);
  });
});
