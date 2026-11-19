import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem, GroceryMonth, PlanItem, Recipe } from '../types.ts';
import { cardStock, dayStock } from './boardStock.js';
import { pantryStatus } from './recipePantry.js';

const gi = (id: string, n: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false, ...extra });
const grocery = (...items: GroceryItem[]): Grocery => ({ stores: ['Anywhere'], items });
const rec = (id: string, n: string, ing: string[] = []): Recipe => ({ id, n, cat: 'dinner', ing: ing.map(x => ({ n: x })), steps: [] }) as unknown as Recipe;
const TODAY = '2026-11-19', MONTH = '2026-11';
const months = (lines: GroceryMonth['lines'] = {}): Record<string, GroceryMonth> => ({ [MONTH]: { lines, pulled: [] } });
const card = (recipe?: Recipe, gone = false) => ({ item: { k: 'r', id: recipe?.id ?? 'x' } as PlanItem, gone, ...(recipe ? { recipe } : {}) });
const mark = (r: ReturnType<typeof card>, g: Grocery, m = months(), o: { day?: string; eaten?: boolean; recipes?: Recipe[] } = {}) =>
  cardStock(r, o.day ?? TODAY, TODAY, o.eaten ?? false, g, m, o.recipes ?? (r.recipe ? [r.recipe] : []));

describe('cardStock: foods with no ingredient lines are matched by their own name', () => {
  const g = grocery(gi('a', 'Greek yogurt'), gi('b', 'Bananas'));
  it('ticked Have shows Have, unticked shows On Shopping', () => {
    expect(mark(card(rec('r1', 'Greek yogurt')), g, months({ a: { have: true } }))).toEqual({ kind: 'have', text: 'Have' });
    expect(mark(card(rec('r1', 'Greek yogurt')), g)).toEqual({ kind: 'shopping', text: 'On Shopping' });
  });
  it('a bought item counts as Have', () => expect(mark(card(rec('r1', 'Greek yogurt')), g, months({ a: { got: true } }))?.kind).toBe('have'));
  it('plural and word-order names match', () => expect(mark(card(rec('r2', 'banana')), g, months({ b: { have: true } }))?.kind).toBe('have'));
  it('a synonym name matches', () => expect(mark(card(rec('r3', 'Courgette')), grocery(gi('z', 'Zucchini')), months({ z: { have: true } }))?.kind).toBe('have'));
  it('no matching item shows nothing, never "out"', () => expect(mark(card(rec('r4', 'Dragon fruit')), g)).toBeNull());
  it('a one-word name inside another product is not a match', () => expect(mark(card(rec('r5', 'Milk')), grocery(gi('c', 'Coconut milk')))).toBeNull());
  it('the tick carries into a new month through the month record the caller passes (the current month is read)', () => {
    expect(mark(card(rec('r1', 'Greek yogurt')), g, months({ a: { have: true } }))?.text).toBe('Have');
  });
});

describe('cardStock: recipes with ingredient lines use the same answer as Recipes', () => {
  const g = grocery(gi('a', 'Garlic'), gi('b', 'Olive oil'), gi('c', 'Pasta'));
  const r = rec('p', 'Pasta dish', ['garlic', 'olive oil', 'pasta']);
  it('all at home is Have', () => expect(mark(card(r), g, months({ a: { have: true }, b: { have: true }, c: { have: true } }))).toEqual({ kind: 'have', text: 'Have' }));
  it('none at home is On Shopping', () => expect(mark(card(r), g)).toEqual({ kind: 'shopping', text: 'On Shopping' }));
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
    const once = grocery(gi('o', 'Greek yogurt', { oneTime: '2026-11' }));
    expect(cardStock(r, TODAY, TODAY, false, once, months({ o: { got: true } }), [], new Set(['o']))).toBeNull();
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
    expect([...out]).toEqual([[0, { kind: 'have', text: 'Have' }], [2, { kind: 'shopping', text: 'On Shopping' }]]);
  });
  it('a past day is empty', () => expect(dayStock('2026-11-10', TODAY, cards, [], g, months(), [a, b, c]).size).toBe(0));
  it('does not change the cards or the grocery data (a pure read)', () => {
    const before = JSON.stringify([cards, g]);
    dayStock(TODAY, TODAY, cards, [], g, months(), [a, b, c]);
    expect(JSON.stringify([cards, g])).toBe(before);
  });
});
