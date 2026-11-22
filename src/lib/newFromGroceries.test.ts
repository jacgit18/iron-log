import { describe, expect, it } from 'vitest';
import { MAX_RECIPES } from '../shared/recipes.js';
import type { GroceryItem, Recipe } from '../types.ts';
import { madeFood } from './foodFromItem.js';
import { confirmed, pillText, sweepFoods, untouchedFood, waitingFoods, withFoodType } from './newFromGroceries.js';

const item = (n: string, over: Partial<GroceryItem> = {}): GroceryItem => ({ id: `i-${n.toLowerCase().replace(/\W+/g, '-')}${over.store ?? ''}`, n, store: '', qty: 1, cents: null, every: true, out: false, ...over });
const own = (id: string, n: string): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [] });

describe('the pill', () => {
  it('counts the flagged Foods and has no text for none', () => {
    const a = madeFood(item('Rice'), 'g-a'), b = own('b', 'Oats');
    expect(waitingFoods([a, b])).toEqual([a]);
    expect(pillText(2)).toBe('2 new from groceries');
    expect(pillText(0)).toBeNull();
  });
  it('a type chip changes the type (and drops the labels); Looks right clears only the marker', () => {
    const e = madeFood(item('Eggs'), 'g-e');
    const t = withFoodType(e, 'ready');
    expect(t).toMatchObject({ type: 'ready', fromGroc: true });
    expect(t.uses).toBeUndefined();
    const [c, other] = confirmed([t, own('z', 'Z')]);
    expect(c!.fromGroc).toBeUndefined();
    expect(c).toMatchObject({ id: 'g-e', type: 'ready', home: e.home });
    expect(other).toEqual(own('z', 'Z'));
  });
  it('Looks right on some ids leaves the others waiting', () => {
    const a = madeFood(item('Rice'), 'g-a'), b = madeFood(item('Oats'), 'g-b');
    expect(waitingFoods(confirmed([a, b], ['g-a'])).map(r => r.id)).toEqual(['g-b']);
  });
});

describe('untouchedFood', () => {
  const i = item('Rice');
  it('is true only for the flagged Food exactly as made and unreferenced', () => {
    const f = madeFood(i, 'g-r');
    expect(untouchedFood(f, i, false)).toBe(true);
    expect(untouchedFood(f, i, true)).toBe(false);
    expect(untouchedFood(Object.fromEntries(Object.entries(f).reverse()) as Recipe, i, false)).toBe(true); // key order does not matter
    expect(untouchedFood(withFoodType(f, 'drink'), i, false)).toBe(false);
    expect(untouchedFood({ ...f, kcal: 100 }, i, false)).toBe(false);
    expect(untouchedFood({ ...f, fav: true }, i, false)).toBe(false);
    expect(untouchedFood(confirmed([f])[0]!, i, false)).toBe(false);
  });
});

describe('sweepFoods', () => {
  it('lists only items that match no Food, with the guessed type, and skips one-time items', () => {
    const items = [item('Whole milk'), item('Rice'), item('Gum', { oneTime: '2026-11' }), item('Lasagna')];
    const s = sweepFoods(items, [own('x', 'Rice')]);
    expect(s.candidates.map(c => [c.item.n, c.type])).toEqual([['Whole milk', 'drink'], ['Lasagna', 'ready']]);
    expect(s.make.map(r => r.n)).toEqual(['Whole milk', 'Lasagna']);
    expect(s.make.every(r => r.fromGroc)).toBe(true);
    expect(s.waiting).toBe(0);
  });
  it('is repeatable: a second sweep after writing finds nothing', () => {
    const items = [item('Whole milk'), item('Lasagna')];
    const s = sweepFoods(items, []);
    expect(sweepFoods(items, s.make).candidates).toEqual([]);
  });
  it('makes one Food for the same name in two stores', () => {
    const s = sweepFoods([item('Milk', { store: 'A' }), item('Milk', { store: 'B' })], []);
    expect(s.make).toHaveLength(1);
  });
  it('stops at the cap and counts what waits', () => {
    const full = Array.from({ length: MAX_RECIPES - 1 }, (_, k) => own(`f${k}`, `Food ${k}`));
    const s = sweepFoods([item('Rice'), item('Oats'), item('Lasagna')], full);
    expect(s.make).toHaveLength(1);
    expect(s.waiting).toBe(2);
    expect(s.candidates).toHaveLength(3);
  });
});

import { isFoodReferenced } from './newFromGroceries.js';
describe('isFoodReferenced', () => {
  const none = { entries: [], recipes: [] };
  it('is false for an unused Food and true for each way of using it', () => {
    expect(isFoodReferenced('g-a', none)).toBe(false);
    expect(isFoodReferenced('g-a', { ...none, entries: [{ from: 'g-a' }] })).toBe(true);
    expect(isFoodReferenced('g-a', { ...none, diet: { plan: { '2026-11-22': [{ k: 'r', id: 'g-a' }] } } })).toBe(true);
    expect(isFoodReferenced('g-a', { ...none, diet: { repeats: [{ rid: 'x', k: 'r', id: 'g-a', days: [1], from: '2026-11-22' }] } })).toBe(true);
    expect(isFoodReferenced('g-a', { ...none, diet: { snacks: [{ id: 'g-a' }] } })).toBe(true);
    expect(isFoodReferenced('g-a', { ...none, recipes: [{ ...own('b', 'B'), pairs: ['g-a'] }] })).toBe(true);
  });
});
