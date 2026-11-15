import { describe, expect, it } from 'vitest';
import type { BodyEntry, BodyGoal } from '../types.ts';
import { goalLine, recommendInputs } from './manageTargets.js';

const entry = (wk: string, w: number): BodyEntry => ({ wk, d: wk, w, updatedAt: '2026-11-01T00:00:00Z' }) as BodyEntry;
const goal = (w: number, by?: string): BodyGoal => ({ w, start: { w: 190, d: '2026-09-01' }, ...(by ? { by } : {}) }) as BodyGoal;
const today = new Date(2026, 10, 12);

describe('goalLine', () => {
  it('says no goal when there is none', () => { expect(goalLine(undefined)).toBe('No goal set'); expect(goalLine(null)).toBe('No goal set'); });
  it('shows the goal without a date', () => expect(goalLine(goal(175))).toBe('Goal: 175 lb'));
  it('shows the goal with its date', () => expect(goalLine(goal(175, '2027-03-01'))).toMatch(/^Goal: 175 lb by .*1/));
});

describe('recommendInputs', () => {
  it('has nothing without data', () => expect(recommendInputs(undefined, [], today)).toEqual({ latest: null, goalLb: null, weeksLeft: null }));
  it('reads latest weight and goal weight, and no weeks without a date', () => expect(recommendInputs(goal(175), [entry('2026-11-09', 182.4)], today)).toEqual({ latest: 182.4, goalLb: 175, weeksLeft: null }));
  it('gives weeks left when the goal has a date in the future', () => {
    const r = recommendInputs(goal(175, '2027-01-07'), [entry('2026-11-09', 182.4)], today);
    expect(r.weeksLeft).toBeCloseTo(8, 0);
  });
});
