import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem, GroceryMonth, PlanItem, Recipe } from '../types.ts';
import { stockContext } from './boardStock.js';
import type { Resolved } from './dietPlan.js';
import { PLANNED_WAITING_NOTE, isReadyMade, isWaiting, plannedWaitingNote, splitHandy, waitingIndexes, waitingText, type HaveGate } from './haveOnly.js';

const gi = (id: string, n: string): GroceryItem => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
const grocery = (...items: GroceryItem[]): Grocery => ({ stores: ['Anywhere'], items });
const food = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [], ...extra }) as unknown as Recipe;
const meal = (id: string, n: string): Recipe => ({ id, n, cat: 'dinner', ing: [{ n: 'Yogurt' }], steps: [] }) as unknown as Recipe;
const TODAY = '2026-11-19', MONTH = '2026-11';
const months = (lines: GroceryMonth['lines'] = {}): Record<string, GroceryMonth> => ({ [MONTH]: { lines, pulled: [] } });
const g = grocery(gi('y', 'Greek yogurt'), gi('o', 'Oats'));
const gate = (o: Partial<HaveGate> = {}): HaveGate => ({ today: TODAY, g, months: months({ o: { have: true } }), diet: [], ...o });
const card = (r: Recipe, index: number, item: Partial<PlanItem> = {}) => ({ r: { item: { k: 'r', id: r.id, ...item } as PlanItem, gone: false, recipe: r }, index });
const yog = food('yog', 'Greek yogurt'), oats = food('oats', 'Oats'), dragon = food('dr', 'Dragon fruit');

describe('isReadyMade', () => {
  it('is a Ready-made recipe with no ingredient lines', () => {
    expect(isReadyMade(yog)).toBe(true);
    expect(isReadyMade(meal('m', 'Greek yogurt'))).toBe(false);
    expect(isReadyMade(food('x', 'X', { ing: [{ n: 'a' }] as Recipe['ing'] }))).toBe(false);
    expect(isReadyMade(food('x', 'X', { cat: 'snack' as Recipe['cat'] }))).toBe(false);
    expect(isReadyMade(undefined)).toBe(false);
  });
});

describe('waitingIndexes', () => {
  const day = '2026-11-20';
  const cards = [card(yog, 0), card(oats, 1), card(dragon, 2)];
  it('a ready-made food that is Need waits; Have and no match do not', () => {
    expect([...waitingIndexes(day, gate(), cards, [yog, oats, dragon])]).toEqual([0]);
  });
  it('ticking Have brings it back', () => {
    expect(waitingIndexes(day, gate({ months: months({ y: { have: true }, o: { have: true } }) }), cards, [yog]).size).toBe(0);
  });
  it('today counts, a past day does not', () => {
    expect(waitingIndexes(TODAY, gate(), cards, [yog]).size).toBe(1);
    expect(waitingIndexes('2026-11-18', gate(), cards, [yog]).size).toBe(0);
  });
  it('nothing waits when Groceries is empty or the day is in another month', () => {
    expect(waitingIndexes(day, gate({ g: grocery() }), cards, [yog]).size).toBe(0);
    expect(waitingIndexes('2026-12-02', gate(), cards, [yog]).size).toBe(0);
  });
  it('a recipe with ingredients and a saved meal never wait, even when Need', () => {
    const rcp = meal('m', 'Greek yogurt bowl');
    const saved = { r: { item: { k: 'm', id: 's' } as PlanItem, gone: false }, index: 5 };
    expect(waitingIndexes(day, gate(), [card(rcp, 3), saved], [rcp]).size).toBe(0);
  });
  it('an eaten card, a gone card and a food pinned Not tracked never wait', () => {
    expect(waitingIndexes(day, gate({ diet: [{ id: 'e1' }] }), [card(yog, 0, { e: ['e1'] })], [yog]).size).toBe(0);
    expect(waitingIndexes(day, gate(), [{ ...card(yog, 0), r: { ...card(yog, 0).r, gone: true } }], [yog]).size).toBe(0);
    const pinned = food('yog', 'Greek yogurt', { home: '-' });
    expect(waitingIndexes(day, gate(), [card(pinned, 0)], [pinned]).size).toBe(0);
  });
  it('a pin to another item decides: pinned to Oats (Have) the food is not waiting', () => {
    const pinned = food('yog', 'Greek yogurt', { home: 'o' });
    expect(waitingIndexes(day, gate(), [card(pinned, 0)], [pinned]).size).toBe(0);
    const toYog = food('dr', 'Dragon fruit', { home: 'y' });
    expect(waitingIndexes(day, gate(), [card(toYog, 0)], [toYog]).size).toBe(1);
  });
});

describe('splitHandy and the chip text', () => {
  it('splits a meal tray into shown and waiting rows', () => {
    const ctx = stockContext('2026-11-20', TODAY, g, months({ o: { have: true } }), []);
    const rows = [yog, oats, dragon].map(r => ({ res: { item: { k: 'r', id: r.id }, name: r.n, gone: false, portion: 1, recipe: r } as Resolved }));
    const { shown, waiting } = splitHandy(rows, ctx);
    expect(waiting.map(x => x.res.recipe!.id)).toEqual(['yog']);
    expect(shown.map(x => x.res.recipe!.id)).toEqual(['oats', 'dr']);
    expect(splitHandy(rows, null).waiting).toEqual([]);
  });
  it('words the count', () => expect(waitingText(3)).toBe('3 waiting on inventory'));
});

describe('plannedWaitingNote: what the Add sheet adds after "Planned X for Lunch."', () => {
  const day = '2026-11-20', all = [yog, oats, dragon];
  const note = (r: Recipe | undefined, days: string[], m = months({ o: { have: true } }), gr = g) => plannedWaitingNote(r, days, TODAY, gr, m, all);
  it('a ready-made food that is Need says so', () => expect(note(yog, [day])).toBe(PLANNED_WAITING_NOTE));
  it('a food that is Have, matches nothing, or is not ready-made says nothing', () => {
    expect(note(oats, [day])).toBe('');
    expect(note(dragon, [day])).toBe('');
    expect(note(meal('m', 'Greek yogurt'), [day])).toBe('');
    expect(note(yog, [day], months({ y: { have: true } }))).toBe('');
  });
  it('no recipe (a saved meal) says nothing', () => expect(note(undefined, [day])).toBe(''));
  it('says so when it waits on any of several days, and nothing for no days', () => {
    expect(note(yog, ['2026-11-21', day])).toBe(PLANNED_WAITING_NOTE);
    expect(note(yog, [])).toBe('');
  });
  it('a day in another month than today\'s never waits, and neither does Groceries with no items', () => {
    expect(note(yog, ['2026-12-03'])).toBe('');
    expect(note(yog, [day], months(), grocery())).toBe('');
  });
});

