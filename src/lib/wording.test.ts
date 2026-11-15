import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECIPE_CATEGORY_LABEL } from '../shared/recipes.js';
import { ADD_FLOWS } from './nutritionBoard.js';
import { RECIPE_TABS } from './recipeList.js';
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

describe('Food naming (Recipes)', () => {
  it('has a Food row that bans Ready-made, and the category and tab follow it', () => {
    const row = WORDING.find(r => r.say === 'Food');
    expect(row?.notThis).toContain('Ready-made');
    expect(RECIPE_CATEGORY_LABEL.ready).toBe('Food');
    expect(RECIPE_TABS.find(t => t.key === 'foods')?.label).toBe('Foods');
    for (const label of Object.values(RECIPE_CATEGORY_LABEL)) expect(label).not.toMatch(/ready-made/i);
  });
});

describe('Scan wording', () => {
  it('has a row that bans the old "Scan barcode" and "Scan a food" for a scan that fills a form', () => {
    const row = WORDING.find(r => r.say.startsWith('Scan to fill'));
    expect(row?.notThis).toEqual(expect.arrayContaining(['Scan barcode', 'Scan a food']));
  });
  // The buttons the row covers, read from their source (a label in a lib string or a constant is outside the component-text test): each says "Scan to fill", none the old words.
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
  it('the scans that fill a form say Scan to fill form (Find food, the supplement add sheet, the Recipes + New menu) and never the old words', () => {
    for (const f of ['components/diet/FoodSearch.tsx', 'components/supplements/SupplementAddSheet.tsx', 'components/recipes/RecipeNewMenu.tsx']) {
      const t = read(f);
      expect(t, f).toMatch(/Scan to fill/);
      expect(t, f).not.toMatch(/>Scan barcode</);
      expect(t, f).not.toMatch(/label: 'Scan a food'/);
    }
  });
  it('the empty-tab notes name the + New entry by its current name', () => {
    expect(read('lib/recipeList.ts')).not.toMatch(/Scan a food|scan a drink/);
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

// Label drift (ownership map, brief nutrition-recipes-ownership-leftovers): one spelling for the same button. "Copy yesterday" and "Save as a meal" are the words; the variants must not come back.
describe('one spelling for the same button', () => {
  const DRIFT: readonly { bad: RegExp; use: string }[] = [
    { bad: /Copy from yesterday/, use: 'Copy yesterday' },
    { bad: /Save as meal\b/, use: 'Save as a meal' },
  ];
  it('has no variant spelling in a component or in the Add sheet table', () => {
    const files = [...walk('src/components'), 'src/lib/nutritionBoard.ts'];
    const hits = files.flatMap(f => { const t = readFileSync(f, 'utf8'); return DRIFT.filter(d => d.bad.test(t)).map(d => `${f}: say "${d.use}"`); });
    expect(hits).toEqual([]);
  });
});

describe('Scan and log wording', () => {
  it('names the scan that saves and logs, in the table and on the Nutrition add way', () => {
    expect(WORDING.find(r => r.say === ADD_FLOWS.barcode.label)?.notThis).toContain('Scan barcode'); // the row is found by the label the toolbar renders, so a rename of either side fails here
  });
});
