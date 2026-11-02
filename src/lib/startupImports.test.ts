import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// export.ts holds the CSV/Excel builders and the data-file parser, which load on demand (import()).
// A static import of it from the store, sync code or any component outside the lazy Settings tab and Excel import would pull it back into the first load.
const root = join(import.meta.dirname, '..');
const LAZY = new Set(['components/settings/ExportUpload.tsx', 'lib/excelImport.ts', 'lib/export.ts']);
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });

describe('startup imports', () => {
  it('only lazily loaded files import lib/export statically', () => {
    const bad = files(root).filter(p => /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p)).map(p => p.slice(root.length + 1)).filter(rel => !LAZY.has(rel))
      .filter(rel => /^import (?!type\b)[^;]*from ['"][^'"]*\/export\.js['"]/m.test(readFileSync(join(root, rel), 'utf8')));
    expect(bad).toEqual([]);
  });
});
