import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bannedLabel, WORDING } from './wording.js';

describe('bannedLabel', () => {
  it('flags "+ Add ..." but lets "+ New ..." keep its plus', () => {
    for (const l of ['+ Add', '+ Add food', '+Add idea']) expect(bannedLabel(l), l).not.toBeNull();
    for (const l of ['+ New recipe', '+ New exercise', '+ Food or meal']) expect(bannedLabel(l), l).toBeNull();
  });
  it('flags Create except for an account or a program', () => {
    expect(bannedLabel('Create recipe')).not.toBeNull();
    expect(bannedLabel('Create new exercise')).not.toBeNull();
    expect(bannedLabel('Create a program')).toBeNull();
    expect(bannedLabel('Create account')).toBeNull();
  });
  it('lets the table words through', () => {
    for (const l of ['Add food', 'Add to Mine', 'Add set', '+ New recipe', 'Delete', 'Remove', 'Done', 'Close', 'Save', 'Cancel']) expect(bannedLabel(l), l).toBeNull();
  });
});

describe('WORDING table', () => {
  it('has one row per word and every row says when', () => {
    expect(new Set(WORDING.map(r => r.say)).size).toBe(WORDING.length);
    for (const r of WORDING) expect(r.when.length).toBeGreaterThan(5);
  });
});

// A ratchet: the labels below already break the table (found 2026-11-11). Fixing one lowers its count here; a new button that breaks the table, or one more in a file, fails the test.
// Most are in files a running build or a hands-off area owns (the Board, Stretches, the Program editor, Recipes, the Nutrition board); each moves with the work that owns it.
const KNOWN: Readonly<Record<string, number>> = {
  'src/components/board/Experiments.tsx': 1, 'src/components/stretches/Stretches.tsx': 1, // the Board and Stretches: hands off
  'src/components/program/Editor.tsx': 1, 'src/components/sheets/NewProgramSheet.tsx': 1, // Program, next to the hands-off day rows
  'src/components/diet/FoodAmountRows.tsx': 1, // PR 903 (two-tap deletes)
  'src/components/recipes/Recipes.tsx': 1, // PR 902 and the Recipes desktop briefs
  'src/components/supplements/SupplementLibrary.tsx': 1, // opens the add sheet; its spec names it "+ Add" (e2e/supplementAdd.spec.js): moves with a supplements change
};

const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []; });
const found = (): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const f of walk('src/components')) {
    const labels = [...readFileSync(f, 'utf8').matchAll(/>([^<>{}\n]{1,60})<\/button>/g)].map(m => m[1]!).filter(l => bannedLabel(l));
    if (labels.length) out[f] = labels;
  }
  return out;
};

describe('button labels in src/components', () => {
  it('break the wording table no more than the known baseline', () => {
    const now = found();
    const worse = Object.entries(now).filter(([f, l]) => l.length > (KNOWN[f] ?? 0)).map(([f, l]) => `${f}: ${l.join(' | ')}`);
    expect(worse, 'a new button label breaks the wording table (ux/DESIGN-SYSTEM.md)').toEqual([]);
  });
  it('has no stale baseline row', () => {
    const now = found();
    const stale = Object.keys(KNOWN).filter(f => (now[f]?.length ?? 0) < (KNOWN[f] ?? 0));
    expect(stale, 'lower or remove these rows in KNOWN').toEqual([]);
  });
});
