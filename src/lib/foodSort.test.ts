import { describe, expect, it } from 'vitest';
import type { FoodHit } from '../shared/foods.js';
import { sortFoodHits } from './foodSort.js';

const hit = (id: number, name: string, kcal: number, p: number): FoodHit => ({ id, name, kcal, p });
const hits = [hit(3, 'Rice, white', 130, 2.7), hit(1, 'chicken breast', 120, 22), hit(10, 'Almonds', 580, 21), hit(2, 'Árbol pepper', 40, 2), hit(9, 'Apple', 52, 0.3)];
const ids = (xs: FoodHit[]) => xs.map(h => h.id);

describe('sortFoodHits', () => {
  it('relevance keeps the order the server returned', () => { expect(ids(sortFoodHits(hits, 'relevance'))).toEqual([3, 1, 10, 2, 9]); });
  it('name: A to Z ignoring case and accents', () => { expect(ids(sortFoodHits(hits, 'name'))).toEqual([10, 9, 2, 1, 3]); });
  it('kcal: low to high', () => { expect(ids(sortFoodHits(hits, 'kcal'))).toEqual([2, 9, 1, 3, 10]); });
  it('protein: high to low', () => { expect(ids(sortFoodHits(hits, 'protein'))).toEqual([1, 10, 3, 2, 9]); });
  it('equal numbers fall back to name, then to id, whatever the input order', () => {
    const tied = [hit(20, 'Tea', 5, 0), hit(4, 'tea', 5, 0), hit(7, 'Soda', 5, 0)];
    for (const s of ['name', 'kcal', 'protein'] as const) {
      expect(ids(sortFoodHits(tied, s))).toEqual([7, 4, 20]);
      expect(ids(sortFoodHits([...tied].reverse(), s))).toEqual([7, 4, 20]);
    }
  });
  it('ids sort as numbers, not text (9 before 10)', () => {
    expect(ids(sortFoodHits([hit(10, 'Same', 1, 1), hit(9, 'Same', 1, 1)], 'kcal'))).toEqual([9, 10]);
  });
  it('does not change the input', () => {
    const before = JSON.stringify(hits);
    for (const s of ['relevance', 'name', 'kcal', 'protein'] as const) sortFoodHits(hits, s);
    expect(JSON.stringify(hits)).toBe(before);
  });
});
