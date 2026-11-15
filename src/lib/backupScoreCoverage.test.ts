// The backup score counts everything a person keeps, so a copy that lost its recipes or supplements cannot replace a fuller copy of the same day.
import { describe, it, expect } from 'vitest';
import { backupScore, shouldWrite } from './autoBackup.js';
import { dataStats } from './entryMerge.js';
import type { DataFile } from '../types.ts';

const recipes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: `Recipe ${i}`, cat: 'protein', ing: [], steps: [] }));
const supp = (n: number) => ({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, taken: {}, items: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, n: `Item ${i}`, slot: '' })) });
const file = (r: number, s: number) => ({ recipes: recipes(r), supplements: supp(s) }) as unknown as Partial<DataFile>;

describe('backup score', () => {
  it('counts recipes and supplement items', () => {
    expect(dataStats(file(3, 4)).recipes).toBe(3);
    expect(dataStats(file(3, 4)).supplementItems).toBe(4);
    expect(backupScore(file(3, 4))).toBe(7);
    expect(backupScore({})).toBe(0);
  });
  it('a copy that lost all recipes does not replace a fuller copy of the same day', () => {
    const full = backupScore(file(30, 0));
    expect(shouldWrite(full, backupScore(file(0, 0)))).toBe(false);
    expect(shouldWrite(full, backupScore(file(25, 0)))).toBe(true); // a normal edit still saves
  });
  it('a copy that lost its supplement items is kept out too', () => {
    expect(shouldWrite(backupScore(file(0, 20)), backupScore(file(0, 2)))).toBe(false);
  });
});
