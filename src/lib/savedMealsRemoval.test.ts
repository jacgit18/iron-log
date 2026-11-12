import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Brief saved-meals-removal, Done when 2: nothing in src/components reads the old saved-meals list. The gate in src/lib/quickMeals.ts (legacyMeals) is the only reader a view may use, through src/store/useLegacyMeals.ts.
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js|jsx)$/.test(p) ? [p] : []; });

describe('no component reads cfg.diet.meals', () => {
  it('finds no `diet.meals`, `diet?.meals` or `.mealsMoved` read under src/components', () => {
    const hits = walk('src/components').filter(f => /diet\??\.(meals|mealsMoved)\b/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
