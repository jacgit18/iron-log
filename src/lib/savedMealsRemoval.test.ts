import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Brief saved-meals-removal, Done when 2: nothing in src/components reads the old saved-meals list. The gate in src/lib/quickMeals.ts (legacyMeals) is the only reader a view may use, through src/store/useLegacyMeals.ts.
const COMPONENTS = join(__dirname, '..', 'components');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => { const p = join(dir, e.name); return e.isDirectory() ? walk(p) : /\.(ts|tsx|js|jsx)$/.test(e.name) ? [p] : []; });

// The ways a component could read the list: the moved record by name, `.meals` off a diet object, a destructured `meals` from one, or the whole diet settings taken into a variable
// (the selector `s => s.cfg.diet`, `= cfg.diet`) where `.meals` can then be read under any name.
const READS: readonly [string, RegExp][] = [
  ['mealsMoved', /\bmealsMoved\b/],
  ['diet.meals', /\bdiet\??\.meals\b/],
  ['destructured meals', /\{[^}]*\bmeals\b[^}]*\}\s*=\s*[^;\n]*\b(?:diet|cfg)\b/],
  ['the whole diet settings', /(?:s\.cfg\.diet\s*\)|=\s*(?:s\.)?cfg\.diet\s*[;,)]|\(s\) => s\.cfg\.diet\b(?!\??\.))/],
];

describe('no component reads cfg.diet.meals', () => {
  it('finds no read of the old saved-meals list under src/components', () => {
    const hits = walk(COMPONENTS).flatMap(f => { const t = readFileSync(f, 'utf8'); return READS.filter(([, re]) => re.test(t)).map(([what]) => `${f.slice(COMPONENTS.length + 1)}: ${what}`); });
    expect(hits).toEqual([]);
  });
  it('the patterns do catch the ways round (so the test above cannot go quiet)', () => {
    const catches = (text: string) => READS.some(([, re]) => re.test(text));
    expect(catches('const m = cfg.diet?.meals;')).toBe(true);
    expect(catches('const { meals } = cfg.diet;')).toBe(true);
    expect(catches('const d = useAppStore(s => s.cfg.diet);')).toBe(true);
    expect(catches('const moved = x.mealsMoved;')).toBe(true);
    expect(catches('const plan = cfg.diet?.plan ?? NO_PLAN;')).toBe(false);
  });
});
