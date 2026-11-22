import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem, GroceryMonth, Recipe } from '../types.ts';
import { stockContext } from './boardStock.js';
import { NEED_TO_BUY, PLANNED_LATER_NOTE, PLANNED_WAITING_NOTE, isNeed, isNeedFood, isReadyMade, plannedWaitingNote, tickHeld } from './haveOnly.js';

const gi = (id: string, n: string): GroceryItem => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
const grocery = (...items: GroceryItem[]): Grocery => ({ stores: ['Anywhere'], items });
const food = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [], ...extra }) as unknown as Recipe;
const meal = (id: string, n: string): Recipe => ({ id, n, cat: 'dinner', ing: [{ n: 'Yogurt' }], steps: [] }) as unknown as Recipe;
const TODAY = '2026-11-19', MONTH = '2026-11';
const months = (lines: GroceryMonth['lines'] = {}): Record<string, GroceryMonth> => ({ [MONTH]: { lines, pulled: [] } });
const g = grocery(gi('y', 'Greek yogurt'), gi('o', 'Oats'));
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

describe('isNeed and isNeedFood', () => {
  const ctx = (o: Partial<{ g: Grocery; months: Record<string, GroceryMonth>; day: string }> = {}) => stockContext(o.day ?? '2026-11-20', TODAY, o.g ?? g, o.months ?? months({ o: { have: true } }), []);
  it('a ready-made food that is Need is Need; Have and no match are not', () => {
    expect(isNeed(yog, ctx())).toBe(true);
    expect(isNeed(oats, ctx())).toBe(false);
    expect(isNeed(dragon, ctx())).toBe(false);
  });
  it('ticking Have clears it', () => expect(isNeed(yog, ctx({ months: months({ y: { have: true } }) }))).toBe(false));
  it('today counts, a past day or another month or an empty Inventory does not', () => {
    expect(isNeed(yog, ctx({ day: TODAY }))).toBe(true);
    expect(isNeed(yog, ctx({ day: '2026-11-18' }))).toBe(false);
    expect(isNeed(yog, ctx({ day: '2026-12-02' }))).toBe(false);
    expect(isNeed(yog, ctx({ g: grocery() }))).toBe(false);
  });
  it('a recipe with ingredients, a saved meal and a food pinned Not tracked are never Need', () => {
    expect(isNeed(meal('m', 'Greek yogurt bowl'), ctx())).toBe(false);
    expect(isNeed(undefined, ctx())).toBe(false);
    expect(isNeed(food('yog', 'Greek yogurt', { home: '-' }), ctx())).toBe(false);
  });
  it('a pin to another item decides', () => {
    expect(isNeed(food('yog', 'Greek yogurt', { home: 'o' }), ctx())).toBe(false);
    expect(isNeed(food('dr', 'Dragon fruit', { home: 'y' }), ctx())).toBe(true);
  });
  it('the flag is for a ready-made food whose mark says shopping; a recipe with ingredients is never flagged', () => {
    expect(isNeedFood(yog, 'shopping')).toBe(true);
    expect(isNeedFood(yog, 'have')).toBe(false);
    expect(isNeedFood(yog, undefined)).toBe(false);
    expect(isNeedFood(meal('m', 'Bowl'), 'shopping')).toBe(false);
    expect(isNeedFood(undefined, 'shopping')).toBe(false);
  });
  it('the tick is held for a flagged food that is not eaten, and an eaten one can always be unticked', () => {
    expect(tickHeld(true, false)).toBe(true);
    expect(tickHeld(true, true)).toBe(false);
    expect(tickHeld(false, false)).toBe(false);
    expect(NEED_TO_BUY).toBe('Need to buy');
  });
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
  it('a day only in a later month gets the later-month note while the food is Need now, and nothing once it is Have', () => {
    expect(note(yog, ['2026-12-03'])).toBe(PLANNED_LATER_NOTE);
    expect(note(yog, ['2026-12-03'], months({ y: { have: true } }))).toBe('');
    expect(note(yog, [day, '2026-12-03'])).toBe(PLANNED_WAITING_NOTE); // a day in today's month decides
  });
  it('a drink gets no note, as the board never tucks a drink away; the same food as a non-drink does', () => {
    const shake = food('shake', 'Protein shake', { uses: ['drink'] });
    const gr = grocery(gi('s', 'Protein shake')); // matched by name, not ticked Have: Need
    expect(plannedWaitingNote(shake, [day], TODAY, gr, months(), [shake])).toBe('');
    expect(plannedWaitingNote({ ...shake, uses: undefined } as Recipe, [day], TODAY, gr, months(), [shake])).toBe(PLANNED_WAITING_NOTE);
  });
  it('a past day gets no note, and neither does Groceries with no items', () => {
    expect(note(yog, ['2026-11-18'])).toBe('');
    expect(note(yog, [day], months(), grocery())).toBe('');
  });
});
