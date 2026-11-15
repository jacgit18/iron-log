import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

// Dead-CSS guard for the Recipes folder (PR "Remove unused .rc-partlist and .rc-type CSS"): every class a recipes stylesheet names appears somewhere in the TypeScript source, as a whole
// string or as the start of a built one. A rule for a class nothing renders fails here, so removed markup cannot leave its styles behind.
describe('recipes stylesheets', () => {
  it('only style classes that the source mentions', () => {
    const code = walk(SRC).filter(f => /\.tsx?$/.test(f) && !/\.test\./.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
    const dead: string[] = [];
    for (const f of walk(join(SRC, 'components/recipes')).filter(f => f.endsWith('.css'))) {
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const c of new Set([...css.matchAll(/\.([a-z][\w-]*)/g)].map(m => m[1] as string))) if (!code.includes(c)) dead.push(`${f.slice(SRC.length + 1)}: .${c}`);
    }
    expect(dead).toEqual([]);
  });
});
