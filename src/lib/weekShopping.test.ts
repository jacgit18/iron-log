import { describe, expect, it } from 'vitest';
import type { DietEntry } from '../types.ts';
import type { Plan } from './dietPlan.js';
import type { Grocery, GroceryItem, Recipe } from '../types.ts';
import { idsAdded, shoppingDays, shoppingNeed, shoppingRecipeIds } from './weekShopping.js';

const recipes = [{ id: 'r1' }, { id: 'r2' }];
const entry = (id: string, d: string): DietEntry => ({ id, d, n: 'x', kcal: 100, p: 1 } as DietEntry);

describe('shoppingDays', () => {
  it('keeps today and later, drops past days and last week', () => {
    expect(shoppingDays(['2026-11-08', '2026-11-09', '2026-11-10'], '2026-11-09')).toEqual(['2026-11-09', '2026-11-10']);
    expect(shoppingDays(['2026-11-01', '2026-11-02'], '2026-11-09')).toEqual([]);
  });
});

describe('shoppingRecipeIds', () => {
  const days = ['2026-11-09', '2026-11-10'];
  it('lists each recipe once however many meals or days use it', () => {
    const plan: Plan = { '2026-11-09': [{ k: 'r', id: 'r1' }, { k: 'r', id: 'r2', s: 'dinner' }], '2026-11-10': [{ k: 'r', id: 'r1', s: 'lunch' }] };
    expect(shoppingRecipeIds(plan, days, recipes, [])).toEqual(['r1', 'r2']);
  });
  it('skips an eaten item, a saved meal and a removed recipe', () => {
    const plan: Plan = { '2026-11-09': [{ k: 'r', id: 'r1', e: ['e1'] }, { k: 'm', id: 'm1' }, { k: 'r', id: 'gone' }, { k: 'r', id: 'r2' }] };
    expect(shoppingRecipeIds(plan, days, recipes, [entry('e1', '2026-11-09')])).toEqual(['r2']);
  });
  it('counts an item whose logged entry was removed as not eaten', () => {
    const plan: Plan = { '2026-11-09': [{ k: 'r', id: 'r1', e: ['e1'] }] };
    expect(shoppingRecipeIds(plan, days, recipes, [])).toEqual(['r1']);
  });
  it('reads only the days given', () => {
    const plan: Plan = { '2026-11-08': [{ k: 'r', id: 'r1' }], '2026-11-10': [{ k: 'r', id: 'r2' }] };
    expect(shoppingRecipeIds(plan, ['2026-11-10'], recipes, [])).toEqual(['r2']);
  });
});

describe('idsAdded', () => {
  it('returns only the ids that are new', () => {
    expect(idsAdded([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])).toEqual(['c', 'd']);
    expect(idsAdded([{ id: 'a' }], [{ id: 'a' }])).toEqual([]);
  });
});

describe('shoppingNeed', () => {
  const item = (id: string, n: string): GroceryItem => ({ id, n, store: 'Anywhere', qty: 1, cents: null, every: false, out: false });
  const list = (...items: GroceryItem[]): Grocery => ({ stores: ['Anywhere'], items });
  const month = { lines: {}, pulled: [] };
  const rec = (id: string, ...ing: string[]) => ({ id, n: id, cat: 'protein', ing: ing.map(n => ({ n })), steps: [] }) as Recipe;
  it('counts each missing name once across recipes', () => {
    const rs = [rec('a', 'garlic', 'pasta'), rec('b', 'garlic', 'flour')];
    expect(shoppingNeed(['a', 'b'], rs, list(), month)).toBe(3);
  });
  it('is 0 when everything is at home or already on the list, or there are no recipes', () => {
    const rs = [rec('a', 'garlic', 'water')];
    expect(shoppingNeed(['a'], rs, list(item('g', 'Garlic')), { lines: { g: { have: true } }, pulled: [] })).toBe(0);
    expect(shoppingNeed(['a'], rs, list(item('g', 'Garlic')), month)).toBe(0); // on the list already, so nothing new to add
    expect(shoppingNeed([], rs, list(), month)).toBe(0);
    expect(shoppingNeed(['gone'], rs, list(), month)).toBe(0);
  });
});
