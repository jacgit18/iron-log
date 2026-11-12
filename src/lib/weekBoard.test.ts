import { describe, expect, it } from 'vitest';
import type { PlanItem, Recipe } from '../types.ts';
import { boardDay, fixFor, moveItem } from './weekBoard.js';

const rec = (id: string, cat: Recipe['cat'], kcal: number, p: number, extra: Partial<Recipe> = {}): Recipe => ({ id, n: id[0]!.toUpperCase() + id.slice(1), cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p, ...extra });
const chili = rec('chili', 'protein', 400, 30, { f: 14, pairs: ['rice'] }), rice = rec('rice', 'carbs', 200, 4, { f: 1, pairs: ['chili'] }), salad = rec('salad', 'sides', 80, 3, { f: 4 }), toast = rec('toast', 'carbs', 160, 5);
const recipes = [chili, rice, salad, toast];
const pi = (id: string, s?: PlanItem['s'], x?: number): PlanItem => ({ k: 'r', id, ...(x ? { x } : {}), ...(s ? { s } : {}) });
const D = '2099-01-01', D2 = '2099-01-02', TODAY = '2099-01-01';

describe('boardDay', () => {
  it('totals the day, groups by meal with an unset group first, and shares the target', () => {
    const plan = { [D]: [pi('toast', 'breakfast'), pi('chili', 'dinner'), pi('salad')] };
    const d = boardDay(plan, D, recipes, [], 2775);
    expect(d).toMatchObject({ count: 3, kcal: 640, protein: 38 });
    expect(d.slots.map(s => s.slot)).toEqual([null, 'breakfast', 'lunch', 'snack', 'dinner']);
    expect(d.slots[4]).toMatchObject({ slot: 'dinner', kcal: 400, share: 971 });
    expect(d.slots[0]!.items.map(x => x.r.name)).toEqual(['Salad']);
  });
  it('checks a meal against what it needs and offers the partner first', () => {
    const d = boardDay({ [D]: [pi('chili', 'dinner')] }, D, recipes, [], null);
    const dinner = d.slots.find(s => s.slot === 'dinner')!;
    expect(dinner.have).toEqual(['protein']);
    expect(dinner.fixes.map(f => [f.mark, f.recipe.id, f.why])).toEqual([['carb', 'rice', 'goes with Chili'], ['veg', 'salad', null]]);
    expect(dinner.share).toBeNull();
  });
  it('does not offer a fix for a meal with nothing in it or a snack', () => {
    const d = boardDay({ [D]: [pi('toast', 'snack')] }, D, recipes, [], 2000);
    expect(d.slots.find(s => s.slot === 'snack')!.fixes).toEqual([]);
    expect(d.slots.find(s => s.slot === 'lunch')!.fixes).toEqual([]);
  });
  it('draws the fat bar whole, hatched or hidden by how much of the day has a fat figure', () => {
    expect(boardDay({ [D]: [pi('chili', 'dinner'), pi('rice', 'dinner')] }, D, recipes, [], null)).toMatchObject({ fat: 15, fatState: 'full' });
    expect(boardDay({ [D]: [pi('chili', 'dinner'), pi('toast', 'dinner')] }, D, recipes, [], null).fatState).toBe('partial'); // toast has no fat: 400 of 560 kcal (71%) are known
    expect(boardDay({ [D]: [pi('chili', 'dinner'), pi('toast', 'dinner', 3)] }, D, recipes, [], null).fatState).toBe('hidden'); // 400 of 880 kcal (45%)
  });
  it('counts a recipe plan portion in the totals', () => {
    expect(boardDay({ [D]: [pi('chili', 'dinner', 1.5)] }, D, recipes, [], null)).toMatchObject({ kcal: 600, protein: 45, fat: 21 });
  });
});

describe('fixFor', () => {
  it('falls back to a favorite, then A to Z, and never something already in the meal', () => {
    const fav = { ...salad, id: 'greens', n: 'Greens', fav: true as const };
    expect(fixFor('veg', [chili], [chili, salad, fav])?.recipe.id).toBe('greens');
    expect(fixFor('carb', [chili, rice], recipes)?.recipe.id).toBe('toast');
    expect(fixFor('veg', [salad], [salad])).toBeNull();
  });
});

describe('boardDay with a saved meal', () => {
  it('does not judge the plate of a meal that holds a saved meal', () => {
    const d = boardDay({ [D]: [{ k: 'm', id: 'm1', s: 'lunch' }] }, D, recipes, [{ id: 'm1', n: 'Bowl', items: [] }], 2775);
    expect(d.slots.find(s => s.slot === 'lunch')).toMatchObject({ need: [], have: [], fixes: [] });
  });
});

describe('boardDay with a saved-meal item that moved (brief saved-meals-removal)', () => {
  it('counts the recipe it became in its meal, and judges the plate with it', () => {
    const d = boardDay({ [D]: [{ k: 'm', id: 'm1', s: 'dinner' }] }, D, recipes, [], null, { m1: 'chili' });
    const dinner = d.slots.find(s => s.slot === 'dinner');
    expect(dinner?.items[0]?.r).toMatchObject({ name: 'Chili', gone: false });
    expect(d.kcal).toBeGreaterThan(0);
    expect(dinner?.have.length).toBeGreaterThan(0);
  });
  it('shows a gone row, and counts nothing, when its recipe is gone', () => {
    const d = boardDay({ [D]: [{ k: 'm', id: 'm1', s: 'dinner' }] }, D, recipes, [], null, { m1: 'deleted' });
    expect(d.slots.find(s => s.slot === 'dinner')?.items[0]?.r.gone).toBe(true);
    expect(d.kcal).toBe(0);
  });
});

describe('moveItem', () => {
  const plan = { [D]: [pi('chili', 'dinner'), pi('rice', 'dinner')], [D2]: [pi('rice', 'lunch')] };
  it('changes only the meal on the same day', () => {
    const r = moveItem(plan, D, 0, D, 'lunch', TODAY);
    expect(r.plan![D]![0]).toEqual({ k: 'r', id: 'chili', s: 'lunch' });
  });
  it('moves to another day and meal, dropping the emptied day', () => {
    const r = moveItem({ [D]: [pi('chili', 'dinner')] }, D, 0, D2, 'dinner', TODAY);
    expect(r.plan).toEqual({ [D2]: [{ k: 'r', id: 'chili', s: 'dinner' }] });
  });
  it('refuses a repeat in the same meal, a full day and a day outside the window', () => {
    expect(moveItem(plan, D, 1, D2, 'lunch', TODAY).error).toMatch(/already in that meal/);
    expect(moveItem({ [D]: [pi('chili', 'lunch')], [D2]: [pi('chili', 'lunch')] }, D, 0, D2, 'lunch', TODAY).error).toMatch(/already in that meal/);
    const full = { [D]: [pi('chili')], [D2]: Array.from({ length: 8 }, (_, i) => ({ k: 'r' as const, id: `r${i}` })) };
    expect(moveItem(full, D, 0, D2, 'dinner', TODAY).error).toMatch(/hold 8/);
    expect(moveItem(plan, D, 0, '2099-03-01', 'dinner', TODAY).error).toMatch(/two weeks/);
  });
  it('allows the same food in another meal of the day, as adding does', () => {
    const r = moveItem({ [D]: [pi('chili', 'lunch')], [D2]: [pi('chili', 'dinner')] }, D, 0, D2, 'lunch', TODAY);
    expect(r.error).toBeNull();
    expect(r.plan![D2]).toEqual([{ k: 'r', id: 'chili', s: 'dinner' }, { k: 'r', id: 'chili', s: 'lunch' }]);
  });
  it('can set an item to no meal', () => {
    const r = moveItem(plan, D, 0, D, undefined, TODAY);
    expect(r.plan![D]![0]).toEqual({ k: 'r', id: 'chili' });
  });
});
