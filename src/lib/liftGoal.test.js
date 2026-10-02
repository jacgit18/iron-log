import { describe, it, expect } from 'vitest';
import { bestLift, liftGoalStatus, liftGoalsStatus, liftGoalNote } from './liftGoal.js';

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
