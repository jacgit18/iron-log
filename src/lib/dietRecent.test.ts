import { describe, expect, it } from 'vitest';
import type { DietEntry, Recipe } from '../types.ts';
import { QUICK_MAX, quickItems } from './dietRecent.js';

const rec = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5, ...extra });
const ate = (id: string, d: string, from: string): DietEntry => ({ id, d, n: from, kcal: 100, p: 5, from });

describe('quickItems', () => {
  it('puts starred first, then the most recently logged', () => {
    const recipes = [rec('a', 'Apple'), rec('b', 'Bread'), rec('c', 'Chili', { fav: true }), rec('d', 'Dates', { fav: true })];
    const entries = [ate('1', '2026-11-01', 'a'), ate('2', '2026-11-05', 'b'), ate('3', '2026-11-02', 'c'), ate('4', '2026-11-06', 'd')];
    expect(quickItems(entries, recipes).map(i => i.id)).toEqual(['d', 'c', 'b', 'a']);
  });
  it('uses the newest day an item was logged', () => {
    const recipes = [rec('a', 'Apple'), rec('b', 'Bread')];
    const entries = [ate('1', '2026-11-05', 'a'), ate('2', '2026-11-01', 'a'), ate('3', '2026-11-03', 'b')];
    expect(quickItems(entries, recipes).map(i => i.id)).toEqual(['a', 'b']);
  });
  it('offers a never-logged item only when starred, and skips food without numbers or catalog copies', () => {
    const recipes = [rec('a', 'Apple'), rec('b', 'Bread', { fav: true }), rec('c', 'Cake', { fav: true, kcal: undefined }), rec('d', 'Dip', { from: 'c:12' })];
    const entries = [ate('1', '2026-11-05', 'c'), ate('2', '2026-11-05', 'd')];
    expect(quickItems(entries, recipes).map(i => i.id)).toEqual(['b']);
  });
  it('stops at 8, hides when empty, and marks the starred', () => {
    const recipes = Array.from({ length: 12 }, (_, i) => rec(`r${i}`, `Food ${String(i).padStart(2, '0')}`, { fav: true }));
    expect(quickItems([], recipes)).toHaveLength(QUICK_MAX);
    expect(quickItems([], [rec('a', 'Apple')])).toEqual([]);
    expect(quickItems([], recipes)[0]!.fav).toBe(true);
  });
});
