import { describe, expect, it } from 'vitest';
import { filterSavedPrograms } from './savedProgramFilter.js';

const items = [{ name: 'Spring cut · Mar 2026' }, { name: '5×5 base block' }, { name: 'Push / Pull / Legs · Jan 2026' }];

describe('filterSavedPrograms', () => {
  it('returns every program for an empty or blank search, as a new list', () => {
    expect(filterSavedPrograms(items, '')).toEqual(items);
    expect(filterSavedPrograms(items, '   ')).not.toBe(items);
  });
  it('matches any case, and every word in any order', () => {
    expect(filterSavedPrograms(items, 'SPRING').map(i => i.name)).toEqual(['Spring cut · Mar 2026']);
    expect(filterSavedPrograms(items, '2026 push').map(i => i.name)).toEqual(['Push / Pull / Legs · Jan 2026']);
    expect(filterSavedPrograms(items, '2026').length).toBe(2);
  });
  it('returns nothing when a word matches no name', () => {
    expect(filterSavedPrograms(items, 'spring bulk')).toEqual([]);
  });
});
