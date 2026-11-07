import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Grocery.tsx was split into one file per component (pure move, `pure-move-refactors.md`, brief grocery-tsx-split) so that grocery changes touch different files.
// A component file that grows past MAX_LINES has taken a second job: split it again instead of raising the limit.
const MAX_LINES = 500;
const dir = import.meta.dirname;
const sources = readdirSync(dir).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));

describe('grocery component files', () => {
  it('stay under the size limit', () => {
    const big = sources.map(f => [f, readFileSync(join(dir, f), 'utf8').split('\n').length] as const).filter(([, n]) => n > MAX_LINES);
    expect(big).toEqual([]);
  });
  it('import each other directly, never through the Grocery.tsx shell', () => {
    const bad = sources.filter(f => f !== 'Grocery.tsx' && /from '\.\/Grocery\.js'/.test(readFileSync(join(dir, f), 'utf8')));
    expect(bad).toEqual([]);
  });
});
