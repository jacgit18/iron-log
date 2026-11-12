import { describe, expect, it } from 'vitest';
import { backupScore, shouldWrite } from './autoBackup.js';
import { buildDataFile, parseDataFile } from './export.js';
import { BUILTIN } from './data.js';
import { dataStats } from './entryMerge.js';
import type { DietEntry, Snapshot } from '../types.ts';

// Diet safety checks (brief diet-safety-checks): the food log goes into the backup file, comes back out of it whole, counts toward the
// same-day shrink guard, and a restore itself is covered by e2e-sync/diet.spec.js.
const entries = (n: number): DietEntry[] => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, d: '2026-10-30', n: `Food ${i}`, kcal: 300, p: 20, c: 30, f: 8, t: 12 }));
const snap = (diet: DietEntry[]) => ({ cfg: { diet: { kcal: 2900, protein: 160 } }, logs: {}, programs: BUILTIN, library: [], body: [], experiments: [], recipes: [], diet } as unknown as Snapshot);

describe('food log in the backup file', () => {
  it('round trips through the data file with every field, and leaves the key out when there is no log', () => {
    const file = buildDataFile(snap(entries(3)), {});
    const back = parseDataFile(JSON.stringify(file));
    expect(back.diet).toEqual(entries(3));
    expect(back.config.diet).toMatchObject({ kcal: 2900, protein: 160 }); // typed targets ride in the config
    expect('diet' in buildDataFile(snap([]), {})).toBe(false);
  });

  it('counts toward the backup score, so a wipe of the food log cannot replace a fuller copy of the same day', () => {
    const full = backupScore(buildDataFile(snap(entries(40)), {}));
    const wiped = backupScore(buildDataFile(snap([]), {}));
    expect(dataStats(parseDataFile(JSON.stringify(buildDataFile(snap(entries(40)), {})))).dietEntries).toBe(40);
    expect(full).toBeGreaterThanOrEqual(40);
    expect(shouldWrite(full, wiped)).toBe(false);
    expect(shouldWrite(full, backupScore(buildDataFile(snap(entries(30)), {})))).toBe(true); // a normal edit still saves
  });
});

describe('usual amount in the backup file (brief nutrition-usual-portion-field)', () => {
  const meal = { id: 'chili', n: 'Chili', cat: 'protein', ing: [], steps: [], kcal: 400, p: 30, usual: 1.5 };
  const withRecipes = (recipes: unknown[]) => ({ ...snap([]), recipes } as unknown as Snapshot);
  it('keeps a usual amount on a non-ready recipe through export and import, and drops a bad one', () => {
    const back = parseDataFile(JSON.stringify(buildDataFile(withRecipes([meal]), {})));
    expect(back.recipes?.[0]).toMatchObject({ id: 'chili', usual: 1.5 });
    const bad = parseDataFile(JSON.stringify(buildDataFile(withRecipes([{ ...meal, usual: 2.3 }, { ...meal, id: 'b', usual: 100 }, { ...meal, id: 'c', usual: 'x' }]), {})));
    expect(bad.recipes).toHaveLength(3);
    for (const r of bad.recipes ?? []) expect(r).not.toHaveProperty('usual');
  });
});
