import { describe, expect, it } from 'vitest';
import type { PlanItem, RepeatItem } from '../types.ts';
import { applyForward, forwardText, planForward } from './planForward.js';

const today = '2026-11-16'; // a Monday
const D1 = '2026-11-17', D2 = '2026-11-18', D3 = '2026-11-19';
const oats = (extra: Partial<PlanItem> = {}): PlanItem => ({ k: 'r', id: 'oats', s: 'breakfast', ...extra });
const planned = (n: number): PlanItem[] => Array.from({ length: n }, (_, i) => ({ k: 'r', id: `x${i}`, s: 'lunch', p: true }));
const rep = (extra: Partial<RepeatItem> = {}): RepeatItem => ({ rid: 'a', k: 'r', id: 'oats', s: 'breakfast', days: [0, 1, 2, 3, 4, 5, 6], from: today, ...extra });
const food = { k: 'r' as const, id: 'oats', s: 'breakfast' as const };

describe('planForward: which later days a Plan reaches', () => {
  it('finds the stored copies of the food in the same meal on later days only', () => {
    const plan = { [D1]: [oats()], [D2]: [oats()], [D3]: [{ k: 'r' as const, id: 'oats', s: 'lunch' as const }] };
    const fp = planForward(plan, undefined, D1, food, today);
    expect(fp.marks).toEqual([{ day: D2, index: 0 }]);
    expect(fp.ask).toBe(true);
  });
  it('asks nothing when no future copy exists: Plan marks this day only', () => {
    expect(planForward({ [D1]: [oats()] }, undefined, D1, food, today)).toEqual({ marks: [], full: [], repeat: null, ask: false });
  });
  it('skips and names a later day already holding 8 planned things, and a copy already planned', () => {
    const plan = { [D1]: [oats()], [D2]: [...planned(8), oats()], [D3]: [oats({ p: true })] };
    const fp = planForward(plan, undefined, D1, food, today);
    expect(fp.marks).toEqual([]);
    expect(fp.full).toEqual([D2]);
    expect(fp.ask).toBe(true); // a day to name is still a future copy
  });
  it('a repeat that stands for the food is marked too, and asks even with no stored copy', () => {
    const fp = planForward({}, [rep()], D1, { ...food, rp: 'a' }, today);
    expect(fp).toEqual({ marks: [], full: [], repeat: 'a', ask: true });
  });
  it('a repeat that is already planned, a handy one and a repeat of another food are left alone', () => {
    expect(planForward({}, [rep({ p: true })], D1, { ...food, rp: 'a' }, today).ask).toBe(false);
    expect(planForward({}, [rep({ h: true })], D1, food, today).repeat).toBeNull();
    expect(planForward({}, [rep({ id: 'tea' })], D1, food, today).repeat).toBeNull();
  });
  it('never reaches past the plan window or back to earlier days', () => {
    const plan = { '2026-11-10': [oats()], [D1]: [oats()], '2028-01-01': [oats()] };
    expect(planForward(plan, undefined, D1, food, today).marks).toEqual([]);
  });
});

describe('applyForward', () => {
  it('plans this day, each later copy and the repeat in one result, leaving other days alone', () => {
    const plan = { [D1]: [oats()], [D2]: [oats()], [D3]: [{ k: 'r' as const, id: 'tea', s: 'snack' as const }] };
    const fp = planForward(plan, [rep()], D1, { ...food, rp: 'a' }, today);
    const r = applyForward(plan, [rep()], fp, D1, 0);
    expect(r.error).toBeNull();
    expect(r.plan![D1]![0]!.p).toBe(true);
    expect(r.plan![D2]![0]!.p).toBe(true);
    expect(r.plan![D3]).toEqual(plan[D3]);
    expect(r.repeats![0]!.p).toBe(true);
    expect(plan[D1]![0]!.p).toBeUndefined(); // the input is not changed
  });
  it('refuses when this day already holds 8 planned things and changes nothing', () => {
    const plan = { [D1]: [...planned(8), oats()], [D2]: [oats()] };
    const r = applyForward(plan, [rep()], planForward(plan, [rep()], D1, food, today), D1, 8);
    expect(r.error).toBe('A day can hold 8 planned things. Unplan one to plan another.');
    expect(r.plan).toBeNull();
  });
  it('a later day that filled up since is skipped, not refused', () => {
    const plan = { [D1]: [oats()], [D2]: [oats()] };
    const fp = planForward(plan, undefined, D1, food, today);
    const full = { ...plan, [D2]: [...planned(8), oats()] };
    const r = applyForward(full, undefined, { ...fp, marks: [{ day: D2, index: 8 }] }, D1, 0);
    expect(r.error).toBeNull();
    expect(r.plan![D2]![8]!.p).toBeUndefined();
  });
});

describe('forwardText', () => {
  it('says what was planned and names the days it skipped', () => {
    expect(forwardText('Oats', D1, { full: [] })).toBe('Planned Oats for Tue 17 and every future day it appears.');
    expect(forwardText('Oats', D1, { full: [D2, D3] })).toBe('Planned Oats for Tue 17 and every future day it appears. Not planned on Wed 18, Thu 19: 8 things are planned there already.');
  });
});
