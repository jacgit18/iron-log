import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem, GroceryMonth, PlanItem, Recipe } from '../types.ts';
import { cardStock, dayStock, foodItem, foodMarks, monthWithCarry, pinValue, stockContext } from './boardStock.js';
import { mealFigures } from './nutritionBoard.js';
import { pantryStatus } from './recipePantry.js';

const gi = (id: string, n: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false, ...extra });
const grocery = (...items: GroceryItem[]): Grocery => ({ stores: ['Anywhere'], items });
const rec = (id: string, n: string, ing: string[] = []): Recipe => ({ id, n, cat: 'dinner', ing: ing.map(x => ({ n: x })), steps: [] }) as unknown as Recipe;
const TODAY = '2026-11-19', MONTH = '2026-11';
const months = (lines: GroceryMonth['lines'] = {}): Record<string, GroceryMonth> => ({ [MONTH]: { lines, pulled: [] } });
const card = (recipe?: Recipe, gone = false) => ({ item: { k: 'r', id: recipe?.id ?? 'x' } as PlanItem, gone, ...(recipe ? { recipe } : {}) });
const mark = (r: ReturnType<typeof card>, g: Grocery, m = months(), o: { day?: string; eaten?: boolean; recipes?: Recipe[] } = {}) => {
  const ctx = stockContext(o.day ?? TODAY, TODAY, g, m, o.recipes ?? (r.recipe ? [r.recipe] : []));
  return ctx ? cardStock(r, o.eaten ?? false, ctx) : null;
};

describe('cardStock: foods with no ingredient lines are matched by their own name', () => {
  const g = grocery(gi('a', 'Greek yogurt'), gi('b', 'Bananas'));
  it('ticked Have shows Have, unticked shows Need', () => {
    expect(mark(card(rec('r1', 'Greek yogurt')), g, months({ a: { have: true } }))).toEqual({ kind: 'have', text: 'Have' });
    expect(mark(card(rec('r1', 'Greek yogurt')), g)).toEqual({ kind: 'shopping', text: 'Need' });
  });
  it('a bought item counts as Have', () => expect(mark(card(rec('r1', 'Greek yogurt')), g, months({ a: { got: true } }))?.kind).toBe('have'));
  it('plural and word-order names match', () => expect(mark(card(rec('r2', 'banana')), g, months({ b: { have: true } }))?.kind).toBe('have'));
  it('a synonym name matches', () => expect(mark(card(rec('r3', 'Courgette')), grocery(gi('z', 'Zucchini')), months({ z: { have: true } }))?.kind).toBe('have'));
  it('no matching item shows nothing, never "out"', () => expect(mark(card(rec('r4', 'Dragon fruit')), g)).toBeNull());
  it('a one-word name inside another product is not a match', () => expect(mark(card(rec('r5', 'Milk')), grocery(gi('c', 'Coconut milk')))).toBeNull());
  it('no record for the current month: the item is Need', () => expect(mark(card(rec('r1', 'Greek yogurt')), g, {})?.text).toBe('Need'));
  it("last month's tick counts before Groceries has carried it (ADR 079), and nothing is written", () => {
    const prior: Record<string, GroceryMonth> = { '2026-08': { lines: { a: { have: true } }, pulled: [] }, [MONTH]: { lines: {}, pulled: [] } };
    const before = JSON.stringify(prior);
    expect(mark(card(rec('r1', 'Greek yogurt')), g, prior)).toEqual({ kind: 'have', text: 'Have' });
    expect(mark(card(rec('r1', 'Greek yogurt')), g, { '2026-08': prior['2026-08']! })?.kind).toBe('have'); // no record at all for this month
    expect(JSON.stringify(prior)).toBe(before);
  });
  it('once the month is carried or holds its own tick, last month is not read again', () => {
    const carried: Record<string, GroceryMonth> = { '2026-08': { lines: { a: { have: true } }, pulled: [] }, [MONTH]: { lines: {}, pulled: [], carried: '2026-08' } };
    expect(mark(card(rec('r1', 'Greek yogurt')), g, carried)?.kind).toBe('shopping'); // unticked since the carry
    expect(monthWithCarry(g, carried, MONTH)).toBe(carried[MONTH]);
  });
});

describe('cardStock: recipes with ingredient lines use the same answer as Recipes', () => {
  const g = grocery(gi('a', 'Garlic'), gi('b', 'Olive oil'), gi('c', 'Pasta'));
  const r = rec('p', 'Pasta dish', ['garlic', 'olive oil', 'pasta']);
  it('all at home is Have', () => expect(mark(card(r), g, months({ a: { have: true }, b: { have: true }, c: { have: true } }))).toEqual({ kind: 'have', text: 'Have' }));
  it('none at home is Need', () => expect(mark(card(r), g)).toEqual({ kind: 'shopping', text: 'Need' }));
  it('some at home is "n of m at home", equal to pantryStatus', () => {
    const m = months({ a: { have: true }, c: { got: true } });
    const s = pantryStatus(r, g, m[MONTH]!, [r]);
    expect(mark(card(r), g, m)).toEqual({ kind: 'partial', text: `${s.have} of ${s.total} at home` });
    expect(s.have).toBe(2);
  });
  it('a recipe whose ingredients are all skipped shows nothing', () => {
    const skipped = { ...rec('s', 'Skipped'), ing: [{ n: 'garlic', skip: true }] } as unknown as Recipe;
    expect(mark(card(skipped), g)).toBeNull();
  });
});

describe('cardStock: when nothing is shown', () => {
  const g = grocery(gi('a', 'Greek yogurt'));
  const r = card(rec('r1', 'Greek yogurt'));
  it('a saved meal (no recipe) shows nothing', () => expect(mark(card(undefined), g)).toBeNull());
  it('a removed card shows nothing', () => expect(mark(card(rec('r1', 'Greek yogurt'), true), g)).toBeNull());
  it('a card ticked as eaten shows nothing', () => expect(mark(r, g, months(), { eaten: true })).toBeNull());
  it('a past day shows nothing', () => expect(mark(r, g, months(), { day: '2026-11-18' })).toBeNull());
  it('a day in another month shows nothing', () => expect(mark(r, g, months(), { day: '2026-12-01' })).toBeNull());
  it('later days this month show it', () => expect(mark(r, g, months(), { day: '2026-11-25' })?.kind).toBe('shopping'));
  it('no Groceries items shows nothing', () => expect(mark(r, grocery())).toBeNull());
  it('a one-time item already bought is not matched', () => {
    const once = grocery(gi('o', 'Greek yogurt', { oneTime: '2026-09' }));
    expect(mark(r, once, months({ o: { got: true } }))).toBeNull();
  });
});

describe('dayStock', () => {
  const a = rec('a', 'Greek yogurt'), b = rec('b', 'Dragon fruit'), c = rec('c', 'Bananas');
  const g = grocery(gi('y', 'Greek yogurt'), gi('n', 'Bananas'));
  const cards = [
    { r: card(a), index: 0 }, { r: card(b), index: 1 }, { r: card(c), index: 2 },
    { r: { item: { k: 'r', id: 'c', e: ['d1'] } as PlanItem, gone: false, recipe: c }, index: 3 },
  ];
  it('keys marks by plan index and leaves out cards with none or eaten', () => {
    const out = dayStock(TODAY, TODAY, cards, [{ id: 'd1' }], g, months({ y: { have: true } }), [a, b, c]);
    expect([...out]).toEqual([[0, { kind: 'have', text: 'Have' }], [2, { kind: 'shopping', text: 'Need' }]]);
  });
  it('a past day is empty', () => expect(dayStock('2026-11-10', TODAY, cards, [], g, months(), [a, b, c]).size).toBe(0));
  it('does not change the cards or the grocery data (a pure read)', () => {
    const before = JSON.stringify([cards, g]);
    dayStock(TODAY, TODAY, cards, [], g, months(), [a, b, c]);
    expect(JSON.stringify([cards, g])).toBe(before);
  });
});

describe('the mark never changes the figures of a day (Done when 4)', () => {
  const a = rec('a', 'Greek yogurt'), b = { ...rec('b', 'Oats'), kcal: 150 } as Recipe;
  const items = [{ r: { item: { k: 'r', id: 'a', p: true, e: ['d1'] } as PlanItem, gone: false, recipe: a, name: 'a', portion: 1, kcal: 120 }, index: 0 }, { r: { item: { k: 'r', id: 'b', p: true } as PlanItem, gone: false, recipe: b, name: 'b', portion: 1, kcal: 150 }, index: 1 }];
  const diet = [{ id: 'd1', d: TODAY, n: 'a', kcal: 120, p: 5 }];
  it('planned count and eaten calories are equal with and without Groceries data', () => {
    const figures = () => mealFigures(items as never, [], diet);
    const without = figures();
    expect(dayStock(TODAY, TODAY, items as never, diet, grocery(), {}, [a, b]).size).toBe(0);
    const withData = dayStock(TODAY, TODAY, items as never, diet, grocery(gi('y', 'Greek yogurt'), gi('o', 'Oats')), months({ y: { have: true } }), [a, b]);
    expect(withData.size).toBe(1); // a is eaten (no mark), b shows one
    expect(figures()).toEqual(without);
    expect(without).toEqual({ planned: 2, eatenKcal: 120, anyEaten: true });
  });
});

describe('cardStock: a ready-made food\'s pin beats its name (brief ready-made-have-gate)', () => {
  const g = grocery(gi('a', 'Greek yogurt'), gi('b', 'Skyr'));
  const food = (home?: string) => ({ ...rec('r1', 'Greek yogurt'), cat: 'ready', ...(home ? { home } : {}) }) as Recipe;
  it('a pin to another item decides, not the name', () => {
    const m = months({ a: { have: true } }); // the name's item is at home, the pinned one is not
    expect(mark(card(food('b')), g, m)).toEqual({ kind: 'shopping', text: 'Need' });
    expect(mark(card(food('a')), g, m)).toEqual({ kind: 'have', text: 'Have' });
  });
  it('a pin makes a food with a name that matches nothing show a mark', () => {
    const odd = { ...food('b'), n: 'Breakfast pot' } as Recipe;
    expect(mark(card(odd), g, months({ b: { have: true } }))?.kind).toBe('have');
  });
  it("'-' is Not tracked: no mark even when the name matches", () => expect(mark(card(food('-')), g, months({ a: { have: true } }))).toBeNull());
  it('a pin to an item that is gone is ignored: the name match applies again', () => {
    expect(mark(card(food('deleted')), g, months({ a: { have: true } }))).toEqual({ kind: 'have', text: 'Have' });
    expect(mark(card(food('deleted')), g)).toEqual({ kind: 'shopping', text: 'Need' });
  });
  it('foodItem returns the pinned item, the named one, or null', () => {
    expect(foodItem(food('b'), g.items)?.id).toBe('b');
    expect(foodItem(food(), g.items)?.id).toBe('a');
    expect(foodItem(food('-'), g.items)).toBeNull();
  });
  it('pinValue is the pin, or empty for none, a pin to a gone item', () => {
    expect([pinValue(food('b'), g.items), pinValue(food('-'), g.items), pinValue(food(), g.items), pinValue(food('deleted'), g.items)]).toEqual(['b', '-', '', '']);
  });
  it('a recipe with ingredient lines ignores a pin', () => {
    const r = { ...rec('p', 'Greek yogurt', ['skyr']), home: 'a' } as Recipe;
    expect(mark(card(r), g, months({ b: { have: true } }))).toEqual({ kind: 'have', text: 'Have' });
  });
  it('foodMarks lists ready-made foods only, by id, against today', () => {
    const list = [food('b'), rec('r2', 'Greek yogurt'), { ...rec('r3', 'Dragon fruit'), cat: 'ready' } as Recipe];
    expect([...foodMarks(list, TODAY, g, months({ b: { have: true } }))]).toEqual([['r1', { kind: 'have', text: 'Have' }]]);
    expect(foodMarks(list, TODAY, grocery(), months()).size).toBe(0);
  });
});
