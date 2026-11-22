import { describe, expect, it } from 'vitest';
import type { CatalogItem, Recipe } from '../types.ts';
import { filtersSkipLibrary, mergedGroups } from './recipeMerged.js';

const mine = (id: string, from?: string) => ({ id, n: id, ...(from ? { from } : {}) }) as unknown as Recipe;
const lib = (id: string) => ({ id, name: id }) as unknown as CatalogItem;

describe('mergedGroups', () => {
  it('keeps your rows and the library rows in their own groups, as given', () => {
    const g = mergedGroups([mine('a'), mine('b')], [mine('a'), mine('b')], [lib('x'), lib('y')]);
    expect(g.mine.map(r => r.id)).toEqual(['a', 'b']);
    expect(g.library.map(r => r.id)).toEqual(['x', 'y']);
  });
  it('never lists a library recipe already in Mine in the library group, even when search hides its copy', () => {
    const all = [mine('copy', 'x'), mine('other')];
    const g = mergedGroups([mine('other')], all, [lib('x'), lib('y')]);
    expect(g.library.map(r => r.id)).toEqual(['y']);
    expect(g.mine.map(r => r.id)).toEqual(['other']);
  });
  it('lists nothing twice', () => {
    const all = [mine('c1', 'x'), mine('c2', 'y')];
    const g = mergedGroups(all, all, [lib('x'), lib('y'), lib('z')]);
    expect(g.library.map(r => r.id)).toEqual(['z']);
  });
});

describe('filtersSkipLibrary', () => {
  it('is true when a nutrition or tag filter is on', () => {
    expect(filtersSkipLibrary([], [])).toBe(false);
    expect(filtersSkipLibrary(['protein'], [])).toBe(true);
    expect(filtersSkipLibrary([], ['quick'])).toBe(true);
  });
});
