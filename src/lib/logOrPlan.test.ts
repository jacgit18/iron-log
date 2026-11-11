import { describe, expect, it } from 'vitest';
import type { DietEntry, PlanItem, PlanSlot, Recipe } from '../types.ts';
import { MAX_PLAN_AHEAD } from '../shared/diet.js';
import { addItem, removeItem, setPortion } from './dietPlan.js';
import { oldestDay, shiftDay } from './dietLog.js';
import { actionWord, dayRange, isAhead, logOrPlan, startAmount, type Ports } from './logOrPlan.js';

const TODAY = '2026-11-11';
const rice: Recipe = { id: 'r1', n: 'Rice', cat: 'ready', servings: 4, kcal: 200, p: 4, steps: [], ings: [] } as unknown as Recipe;
const bar: Recipe = { ...rice, id: 'r2', n: 'Bar', usual: 2 } as Recipe;

/** A fake store with the real plan functions behind it, so plan rules (window, duplicates, portion) are the real ones. */
function fake() {
  const s = { entries: [] as DietEntry[], plan: {} as Record<string, PlanItem[]>, n: 0 };
  const ports: Ports = {
    addDietEntry: d => { const id = `e${++s.n}`; s.entries.push({ ...d, id }); return { id, error: null }; },
    removeDietEntry: id => { s.entries = s.entries.filter(e => e.id !== id); },
    addPlanItem: (day, kind, id, slot) => { const r = addItem(s.plan, day, { k: kind, id, ...(slot ? { s: slot } : {}) }, TODAY); if (r.plan === null) return r.error; s.plan = r.plan; return null; },
    setPlanPortion: (day, i, p) => { s.plan = setPortion(s.plan, day, i, p); },
    removePlanItem: (day, i) => { s.plan = removeItem(s.plan, day, i); },
    plan: () => s.plan,
  };
  return { s, ports };
}

describe('days offered', () => {
  it('goes back as far as the log keeps entries and ahead as far as the board plans', () => {
    expect(dayRange(TODAY)).toEqual({ min: oldestDay(TODAY), max: shiftDay(TODAY, MAX_PLAN_AHEAD) });
    expect(MAX_PLAN_AHEAD).toBe(13);
  });
  it('plans only after today', () => {
    expect(isAhead(TODAY, TODAY)).toBe(false);
    expect(actionWord(TODAY, TODAY)).toBe('Log');
    expect(actionWord(shiftDay(TODAY, -3), TODAY)).toBe('Log');
    expect(actionWord(shiftDay(TODAY, 1), TODAY)).toBe('Plan');
  });
});

describe('opens at the usual amount', () => {
  it('uses usual, else 1', () => { expect(startAmount(bar)).toBe(2); expect(startAmount(rice)).toBe(1); });
});

describe('today or earlier logs', () => {
  it('logs one entry through ateEntry, with no plan item', () => {
    const { s, ports } = fake();
    const r = logOrPlan(ports, rice, 2, TODAY, TODAY, null);
    expect(r.ok).toBe(true);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ d: TODAY, n: 'Rice', kcal: 400, p: 8, from: 'r1' });
    expect(s.plan).toEqual({});
  });
  it('logs an earlier day and needs no meal', () => {
    const { s, ports } = fake();
    const day = shiftDay(TODAY, -2);
    expect(logOrPlan(ports, rice, 1, day, TODAY, null).ok).toBe(true);
    expect(s.entries[0]!.d).toBe(day);
  });
  it('refuses a day before the oldest kept day', () => {
    const { s, ports } = fake();
    const r = logOrPlan(ports, rice, 1, shiftDay(oldestDay(TODAY), -1), TODAY, null);
    expect(r.ok).toBe(false);
    expect(s.entries).toHaveLength(0);
  });
  it('Undo removes only the entry it made', () => {
    const { s, ports } = fake();
    ports.addDietEntry({ d: TODAY, n: 'Eggs', kcal: 150, p: 12 });
    const r = logOrPlan(ports, rice, 1, TODAY, TODAY, null);
    logOrPlan(ports, rice, 1, TODAY, TODAY, null);
    if (r.ok) r.undo();
    expect(s.entries.map(e => e.n)).toEqual(['Eggs', 'Rice']);
  });
});

describe('a day ahead plans', () => {
  const tomorrow = shiftDay(TODAY, 1);
  it('needs a meal and writes nothing without one', () => {
    const { s, ports } = fake();
    const r = logOrPlan(ports, rice, 1, tomorrow, TODAY, null);
    expect(r).toEqual({ ok: false, error: 'Pick a meal.' });
    expect(s.plan).toEqual({});
    expect(s.entries).toHaveLength(0);
  });
  it('puts the recipe in that meal with the portion, and logs nothing', () => {
    const { s, ports } = fake();
    const r = logOrPlan(ports, rice, 1.5, tomorrow, TODAY, 'dinner' as PlanSlot);
    expect(r.ok).toBe(true);
    expect(s.plan[tomorrow]).toEqual([{ k: 'r', id: 'r1', x: 1.5, s: 'dinner' }]);
    expect(s.entries).toHaveLength(0);
  });
  it('stores a portion of 1 as no amount', () => {
    const { s, ports } = fake();
    logOrPlan(ports, rice, 1, tomorrow, TODAY, 'lunch');
    expect(s.plan[tomorrow]).toEqual([{ k: 'r', id: 'r1', s: 'lunch' }]);
  });
  it('plans the last day the board allows and not the one after', () => {
    const { ports } = fake();
    expect(logOrPlan(ports, rice, 1, shiftDay(TODAY, MAX_PLAN_AHEAD), TODAY, 'lunch').ok).toBe(true);
    expect(logOrPlan(ports, rice, 1, shiftDay(TODAY, MAX_PLAN_AHEAD + 1), TODAY, 'lunch').ok).toBe(false);
  });
  it('says so when the same food is already in that meal, and adds nothing', () => {
    const { s, ports } = fake();
    logOrPlan(ports, rice, 1, tomorrow, TODAY, 'lunch');
    const r = logOrPlan(ports, rice, 2, tomorrow, TODAY, 'lunch');
    expect(r.ok).toBe(false);
    expect(s.plan[tomorrow]).toHaveLength(1);
    expect(s.plan[tomorrow]![0]!.x).toBeUndefined();
  });
  it('refuses a portion the planner cannot hold', () => {
    const { s, ports } = fake();
    expect(logOrPlan(ports, rice, 11, tomorrow, TODAY, 'lunch').ok).toBe(false);
    expect(s.plan).toEqual({});
  });
  it('Undo removes only the plan item it made', () => {
    const { s, ports } = fake();
    ports.addPlanItem(tomorrow, 'r', 'r2', 'lunch');
    const r = logOrPlan(ports, rice, 1, tomorrow, TODAY, 'lunch');
    ports.addPlanItem(tomorrow, 'm', 'm9', 'dinner'); // a later change to the day
    if (r.ok) r.undo();
    // 'm' items need the meal to exist in the real store; here the fake accepts it, which is enough to show the list shifts safely
    expect(s.plan[tomorrow]!.map(i => i.id)).toEqual(['r2', 'm9']);
  });
});
