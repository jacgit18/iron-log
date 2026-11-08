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
  it('keeps the shell\'s stylesheet-order imports, in order', () => {
    // These bare imports load each component's stylesheet in the order Grocery.tsx imported them before the split; the shell uses none of them. Removing or sorting them changes the built CSS order:
    // if one has to go, compare the built CSS (the Daily chunk's md5) before and after.
    const lines = readFileSync(join(dir, 'Grocery.tsx'), 'utf8').split('\n');
    const bare = lines.filter(l => /^import '\.{1,2}\/[^']*\.jsx?';$/.test(l));
    expect(lines[0]).toMatch(/^\/\/ Loads the components' stylesheets/);
    expect(bare.map(l => l.slice(8, -2).replace(/\.jsx?$/, ''))).toEqual(['../EmptyTiles', './BulkShare', './GroceryBoughtTabs', './GroceryMore', './GroceryPhoneBar', './GroceryQuickAdd', './GroceryRail', './InventoryRail', './GroceryStoreChips', './GroceryTotalBar', './GrocerySummary', '../Notice', './GrocerySpend', './PriceChips', './ReceiptNames', './ReceiptScan', './Receipts', './SharePicker', './SharingGroups', './SplitSection', './StoreTax', './StoreMoney']);
    expect(lines.slice(1, 1 + bare.length)).toEqual(bare);
  });
});
