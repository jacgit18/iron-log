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

  it('keeps the stored portion x of an entry through the data file (brief portion-scaled-micros)', () => {
    const eaten: DietEntry[] = [{ id: 'p1', d: '2026-10-30', n: 'Oats', kcal: 600, p: 30, x: 2.5, micro: { calcium: 300 } }];
    expect(parseDataFile(JSON.stringify(buildDataFile(snap(eaten), {}))).diet).toEqual(eaten);
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

describe('At home pin in the backup file (brief ready-made-have-gate)', () => {
  const food = { id: 'yog', n: 'Greek yogurt', cat: 'ready', ing: [], steps: [], kcal: 100, p: 10 };
  const withRecipes = (recipes: unknown[]) => ({ ...snap([]), recipes } as unknown as Snapshot);
  it('keeps a pin and Not tracked on a ready-made food through export and import, and drops a bad one', () => {
    const back = parseDataFile(JSON.stringify(buildDataFile(withRecipes([{ ...food, home: 'i4' }, { ...food, id: 'b', home: '-' }]), {})));
    expect(back.recipes?.map(r => r.home)).toEqual(['i4', '-']);
    const bad = parseDataFile(JSON.stringify(buildDataFile(withRecipes([{ ...food, home: 7 }, { ...food, id: 'b', home: '' }, { ...food, id: 'c', home: 'x'.repeat(61) }]), {})));
    expect(bad.recipes).toHaveLength(3);
    for (const r of bad.recipes ?? []) expect(r).not.toHaveProperty('home');
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
    const never = parseDataFile(JSON.stringify(buildDataFile(withRecipes([{ ...meal, usual: 1 }, { ...meal, id: 'b', usual: 0.25 }]), {}))); // the stored field never holds 1, and 0.5 is the least
    expect(never.recipes).toHaveLength(2);
    for (const r of never.recipes ?? []) expect(r).not.toHaveProperty('usual');
  });
});
