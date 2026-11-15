import { describe, expect, it } from 'vitest';
import type { CatalogItem, Recipe } from '../types.ts';
import { countText, filtersSkipLibrary, libraryBoxShown, mergedGroups, sourceCounts, yourHeadingShown, type BoxInput } from './recipeMerged.js';

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

describe('sourceCounts and countText', () => {
  const g = mergedGroups([mine('a'), mine('b')], [mine('a'), mine('b')], [lib('x'), lib('y'), lib('z')]);
  it('counts match the rows: All is both groups', () => {
    const c = sourceCounts(g, true, false);
    expect(c).toEqual({ all: 5, mine: 2, library: 3, plus: false });
    expect(['all', 'mine', 'library'].map(s => countText(s as 'all', c))).toEqual(['5', '2', '3']);
  });
  it('ends the Library and All counts in + while more pages exist, not Mine', () => {
    const c = sourceCounts(g, true, true);
    expect(['all', 'mine', 'library'].map(s => countText(s as 'all', c))).toEqual(['5+', '2', '3+']);
  });
  it('has no Library count before the library has loaded, and All is only yours', () => {
    const c = sourceCounts(g, false, true);
    expect(c).toEqual({ all: 2, mine: 2, library: null, plus: false });
    expect(countText('library', c)).toBe('');
    expect(countText('all', c)).toBe('2');
  });
});

describe('libraryBoxShown', () => {
  const base: BoxInput = { source: 'all', q: '', browse: false, tab: 'all', recent: false, cat: null };
  it('is folded with no search text until Browse the library is open', () => {
    expect(libraryBoxShown(base)).toBe(false);
    expect(libraryBoxShown({ ...base, browse: true })).toBe(true);
  });
  it('opens on search text, but not on spaces', () => {
    expect(libraryBoxShown({ ...base, q: 'soup' })).toBe(true);
    expect(libraryBoxShown({ ...base, q: '  ' })).toBe(false);
  });
  it('is always open under the Library filter and never under Mine', () => {
    expect(libraryBoxShown({ ...base, source: 'library' })).toBe(true);
    expect(libraryBoxShown({ ...base, source: 'mine', q: 'soup', browse: true })).toBe(false);
  });
  it('is hidden where the library has nothing: Foods, Ready-made, Recent', () => {
    expect(libraryBoxShown({ ...base, q: 'a', tab: 'foods' })).toBe(false);
    expect(libraryBoxShown({ ...base, q: 'a', cat: 'ready' })).toBe(false);
    expect(libraryBoxShown({ ...base, q: 'a', recent: true })).toBe(false);
    expect(libraryBoxShown({ ...base, q: 'a', tab: 'drinks' })).toBe(true);
  });
});

describe('filtersSkipLibrary', () => {
  it('is true when a nutrition or tag filter is on', () => {
    expect(filtersSkipLibrary([], [])).toBe(false);
    expect(filtersSkipLibrary(['protein'], [])).toBe(true);
    expect(filtersSkipLibrary([], ['quick'])).toBe(true);
  });
});

describe('yourHeadingShown', () => {
  it('shows only with the library box drawn under your recipes', () => {
    expect(yourHeadingShown(true, true, true)).toBe(true);
    expect(yourHeadingShown(false, true, true)).toBe(false); // box folded, Mine, or hidden for the tab
    expect(yourHeadingShown(true, false, true)).toBe(false); // Library filter hides your group
    expect(yourHeadingShown(true, true, false)).toBe(false); // nothing of yours
  });
});
