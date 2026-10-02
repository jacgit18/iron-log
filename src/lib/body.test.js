import { describe, it, expect } from 'vitest';
import { goalStatus } from './body.js';

const body = [
  { wk: '2026-09-06', d: '2026-09-06', w: 200 }, { wk: '2026-09-13', d: '2026-09-13', w: 198 },
  { wk: '2026-09-20', d: '2026-09-20', w: 197 }, { wk: '2026-09-27', d: '2026-09-27', w: 195 },
];
const today = new Date(2026, 9, 2);

describe('body weight goal', () => {
  it('works out what is left, progress and recent pace', () => {
    const g = goalStatus({ w: 180, start: { w: 200, d: '2026-09-06' } }, body, today);
    expect(g).toMatchObject({ dir: 'lose', now: 195, left: -15, reached: false, pct: 25 });
    expect(g.pace).toBeCloseTo(-5 / 3);
  });
  it('gives the weekly change needed to hit a date', () => {
    const g = goalStatus({ w: 185, start: { w: 200, d: '2026-09-06' }, by: '2026-11-01' }, body, today);
    expect(g.weeksLeft).toBeCloseTo(30 / 7, 1);
    expect(g.need).toBeCloseTo(-10 / (30 / 7), 1);
  });
  it('knows when a gain goal is reached', () => {
    expect(goalStatus({ w: 190, start: { w: 185, d: '2026-08-01' } }, body, today)).toMatchObject({ dir: 'gain', reached: true, pct: 100 });
  });
  it('handles no goal and no weigh-ins', () => {
    expect(goalStatus(null, body, today)).toBeNull();
    expect(goalStatus({ w: 180 }, [], today)).toEqual({ target: 180, last: null, by: null });
  });
});
