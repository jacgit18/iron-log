import { describe, expect, it } from 'vitest';
import type { DietEntry, PlanItem, Recipe, SavedMeal } from '../types.ts';
import { MAX_DIET_PER_DAY, MAX_PLAN_ITEMS } from '../shared/diet.js';
import { addItem, dayTotals, daysFrom, inWindow, planLog, prunePlan, recipeIdsFor, removeItem, resolve, setPortion, totalsText } from './dietPlan.js';

const today = '2026-10-30';
const recipes: Recipe[] = [
  { id: 'r1', n: 'Chili', cat: 'protein', ing: [], steps: [], kcal: 600, p: 40, c: 51, f: 11 },
  { id: 'r2', n: 'Salad', cat: 'sides', ing: [], steps: [] },
  { id: 'r3', n: 'Rice', cat: 'sides', ing: [], steps: [], kcal: 200, p: 4 },
];
const meals: SavedMeal[] = [{ id: 'm1', n: 'Breakfast', items: [{ n: 'Oats', kcal: 350, p: 12 }, { n: 'Banana', kcal: 100, p: 1 }] }];
const r = (id: string, x?: number): PlanItem => ({ k: 'r', id, ...(x ? { x } : {}) });
const m = (id: string): PlanItem => ({ k: 'm', id });

describe('window', () => {
  it('daysFrom counts forward and inWindow is today to 13 days after', () => {
    expect(daysFrom('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(inWindow('2026-10-29', today)).toBe(false); expect(inWindow('2026-10-30', today)).toBe(true);
    expect(inWindow('2026-11-12', today)).toBe(true); expect(inWindow('2026-11-13', today)).toBe(false);
  });
  it('prunePlan drops earlier days', () => { expect(Object.keys(prunePlan({ '2026-10-29': [r('r1')], '2026-10-30': [r('r1')] }, today))).toEqual(['2026-10-30']); });
});

describe('addItem, setPortion, removeItem', () => {
  it('adds in order, refuses a repeat, a day outside the window and a ninth item', () => {
    let p = addItem({}, today, r('r1'), today).plan!;
    p = addItem(p, today, m('m1'), today).plan!;
    expect(p[today]).toEqual([r('r1'), m('m1')]);
    expect(addItem(p, today, r('r1'), today).error).toMatch(/already/);
    expect(addItem(p, '2026-10-29', r('r3'), today).error).toMatch(/two weeks/);
    const full: Record<string, PlanItem[]> = { [today]: Array.from({ length: MAX_PLAN_ITEMS }, (_, i) => r(`x${i}`)) };
    expect(addItem(full, today, r('r1'), today).error).toContain(String(MAX_PLAN_ITEMS));
  });
  it('sets a portion in half steps, stores 1 as no x, and leaves a meal or a bad portion alone', () => {
    const p = { [today]: [r('r1'), m('m1')] };
    expect(setPortion(p, today, 0, 1.5)[today]![0]).toEqual(r('r1', 1.5));
    expect(setPortion(setPortion(p, today, 0, 2), today, 0, 1)[today]![0]).toEqual({ k: 'r', id: 'r1' });
    expect(setPortion(p, today, 1, 2)).toBe(p); expect(setPortion(p, today, 0, 0.25)).toBe(p); expect(setPortion(p, today, 0, 11)).toBe(p); expect(setPortion(p, today, 0, 1.2)).toBe(p);
  });
  it('removes an item and drops an emptied day', () => {
    const p = { [today]: [r('r1'), m('m1')], '2026-10-31': [r('r3')] };
    expect(removeItem(p, today, 0)[today]).toEqual([m('m1')]);
    expect(Object.keys(removeItem(p, '2026-10-31', 0))).toEqual([today]);
  });
});

describe('resolve and dayTotals', () => {
  it('scales a recipe by its portion and totals a meal', () => {
    expect(resolve(r('r1', 1.5), recipes, meals)).toMatchObject({ name: 'Chili', kcal: 900, p: 60, gone: false });
    expect(resolve(m('m1'), recipes, meals)).toMatchObject({ name: 'Breakfast', kcal: 450, p: 13 });
  });
  it('adds a day up, counts a recipe without numbers and ignores removed items', () => {
    expect(dayTotals([r('r1'), m('m1'), r('r3', 2)], recipes, meals)).toEqual({ kcal: 1450, protein: 61, without: 0 });
    expect(dayTotals([r('r1'), r('r2'), r('gone'), m('nope')], recipes, meals)).toEqual({ kcal: 600, protein: 40, without: 1 });
  });
  it('marks a missing recipe or meal as gone', () => { expect(resolve(r('zzz'), recipes, meals)).toMatchObject({ gone: true, name: 'Removed' }); expect(resolve(m('zzz'), recipes, meals).gone).toBe(true); });
});

describe('totalsText', () => {
  it('words the totals with and without targets', () => {
    expect(totalsText({ kcal: 2150, protein: 120, without: 0 }, 2775, 150)).toBe('Planned 2,150 of 2,775 kcal · 120 of 150 g protein');
    expect(totalsText({ kcal: 600, protein: 40, without: 1 }, null, null)).toBe('Planned 600 kcal · 40 g protein · 1 without calories');
  });
});

describe('planLog', () => {
  const e = (d: string): DietEntry => ({ id: Math.random().toString(), d, n: 'F', kcal: 1, p: 0 });
  it('a recipe logs one entry at its portion with the recipe link', () => {
    const out = planLog(resolve(r('r1', 2), recipes, meals), [], today);
    expect(out).toEqual({ add: [{ n: 'Chili', kcal: 1200, p: 80, c: 102, f: 22, from: 'r1' }], left: 0 });
  });
  it('a meal logs each food and stops at the per-day limit', () => {
    expect('add' in planLog(resolve(m('m1'), recipes, meals), [], today) && (planLog(resolve(m('m1'), recipes, meals), [], today) as { add: unknown[] }).add).toHaveLength(2);
    const day = Array.from({ length: MAX_DIET_PER_DAY - 1 }, () => e(today));
    expect(planLog(resolve(m('m1'), recipes, meals), day, today)).toMatchObject({ left: 1 });
  });
  it('a full day logs nothing for a recipe, and a recipe without numbers or a removed item gives a reason', () => {
    const day = Array.from({ length: MAX_DIET_PER_DAY }, () => e(today));
    expect(planLog(resolve(r('r1'), recipes, meals), day, today)).toEqual({ add: [], left: 1 });
    expect(planLog(resolve(r('r2'), recipes, meals), [], today)).toMatchObject({ error: expect.stringContaining('calories') });
    expect(planLog(resolve(r('zzz'), recipes, meals), [], today)).toMatchObject({ error: expect.stringContaining('removed') });
  });
});

describe('recipeIdsFor', () => {
  it('lists the recipes of the days once each, skipping meals and removed recipes', () => {
    const p = { [today]: [r('r1'), m('m1'), r('gone')], '2026-10-31': [r('r3'), r('r1')], '2026-11-20': [r('r2')] };
    expect(recipeIdsFor(p, daysFrom(today, 7), recipes)).toEqual(['r1', 'r3']);
  });
});
