import { describe, expect, it } from 'vitest';
import type { GroceryItem } from '../types.ts';
import { filterGroceryItems, foldText, sortGroceryItems, type SortFacts } from './grocerySort.js';

const item = (id: string, n: string, cents: number | null = null, qty = 1): GroceryItem => ({ id, n, store: 'Aldi', qty, cents, every: true, out: false });
const list = [item('a', 'Rice', 300), item('b', 'Apples', 500), item('c', 'Bread'), item('d', 'Árbol chili', 500), item('e', 'Eggs', 100, 6)];
const ticks = new Set(['a', 'd']);
const facts: SortFacts = { cents: i => (i.cents == null ? null : i.cents * i.qty), ticked: i => ticks.has(i.id) };
const ids = (xs: GroceryItem[]) => xs.map(i => i.id);

describe('sortGroceryItems', () => {
  it('name: A to Z ignoring case and accents', () => {
    expect(ids(sortGroceryItems(list, 'name', facts))).toEqual(['b', 'd', 'c', 'e', 'a']);
  });
  it('price: dearest first by line cost, equal prices by name, unpriced last', () => {
    expect(ids(sortGroceryItems(list, 'price', facts))).toEqual(['e', 'b', 'd', 'a', 'c']); // Eggs 6 x 100 = 600
  });
  it('not ticked first: unticked before ticked, A to Z inside each', () => {
    expect(ids(sortGroceryItems(list, 'open', facts))).toEqual(['b', 'c', 'e', 'd', 'a']);
  });
  it('ties on name and price fall back to id, whatever the input order', () => {
    const twins = [item('t2', 'Tea', 200), item('t1', 'tea', 200)];
    for (const s of ['name', 'price', 'open'] as const) {
      expect(ids(sortGroceryItems(twins, s, facts))).toEqual(['t1', 't2']);
      expect(ids(sortGroceryItems([...twins].reverse(), s, facts))).toEqual(['t1', 't2']);
    }
  });
  it('leaves the input list, its order and its objects alone', () => {
    const before = JSON.stringify(list);
    for (const s of ['name', 'price', 'open'] as const) sortGroceryItems(list, s, facts);
    expect(JSON.stringify(list)).toBe(before);
    expect(sortGroceryItems(list, 'name', facts)[0]).toBe(list[1]); // the same object, not a copy
  });
  it('handles an empty list', () => { expect(sortGroceryItems([], 'price', facts)).toEqual([]); });
});

describe('filterGroceryItems', () => {
  it('matches part of a name, ignoring case and accents', () => {
    expect(ids(filterGroceryItems(list, 'ARB'))).toEqual(['d']);
    expect(ids(filterGroceryItems(list, 'arbol'))).toEqual(['d']);
    expect(ids(filterGroceryItems([item('x', 'Café')], 'cafe'))).toEqual(['x']);
  });
  it('an empty or blank search keeps everything, in order', () => {
    expect(ids(filterGroceryItems(list, ''))).toEqual(ids(list));
    expect(ids(filterGroceryItems(list, '   '))).toEqual(ids(list));
  });
  it('trims the search and returns nothing when nothing matches', () => {
    expect(ids(filterGroceryItems(list, '  eggs '))).toEqual(['e']);
    expect(filterGroceryItems(list, 'zzz')).toEqual([]);
  });
  it('foldText strips accents and case', () => { expect(foldText('Crème BRÛLÉE')).toBe('creme brulee'); });
});
