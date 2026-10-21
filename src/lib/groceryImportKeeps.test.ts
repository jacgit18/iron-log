import { describe, expect, it } from 'vitest';
import { mergeGrocery, normGrocery } from './grocery.js';
import type { GroceryData, GroceryMonth } from '../types.ts';

// Audit X-6: "Add to my data" kept no purchase of an item that had been removed (its line stays in its month since #420), so a backup added to other data lost that history.
const item = (id: string, n: string, store = 'Aldi') => ({ id, n, store, qty: 1, cents: 100, every: true, out: false });
const file = (over: Partial<GroceryData> = {}): GroceryData => ({
  stores: ['Aldi'], items: [item('rice', 'Rice')], months: {
    '2026-09': { lines: { rice: { got: true }, milk: { got: true, qty: 1, cents: 1000, store: 'Aldi', share: { with: ['sis'] } } }, pulled: [], tax: { Aldi: 80 } },
  }, ...over,
});

describe('adding a file into data here', () => {
  it('keeps the purchase of an item the file no longer lists, under its own id', () => {
    const out = mergeGrocery(normGrocery(null), {}, file());
    expect(Object.keys(out.months['2026-09'].lines).sort()).toEqual(['milk', 'rice']);
    expect(out.months['2026-09'].lines.milk).toMatchObject({ got: true, cents: 1000, store: 'Aldi', share: { with: ['sis'] } });
    expect(out.months['2026-09'].tax).toEqual({ Aldi: 80 });
    expect(out.changed).toBe(true);
  });
  it('adding the same file again changes nothing', () => {
    const first = mergeGrocery(normGrocery(null), {}, file());
    const again = mergeGrocery(first.grocery, first.months, file());
    expect(again.changed).toBe(false);
  });
  it('drops such a line when an item here has that id (it would be attached to the wrong item)', () => {
    const here = normGrocery({ stores: ['Lidl'], items: [item('milk', 'Oat milk', 'Lidl')] });
    const out = mergeGrocery(here, {}, file());
    expect(Object.keys(out.months['2026-09'].lines)).toEqual(['rice']);
  });
  it('gives an incoming item a new id when its id is one a kept purchase uses, so it does not inherit that purchase', () => {
    const data = file({ items: [item('rice', 'Rice'), item('milk', 'Milk', 'Lidl')], stores: ['Aldi', 'Lidl'] });
    // the file lists milk as an item AND here an old purchase line named milk exists under another item's history
    const months: Record<string, GroceryMonth> = { '2026-08': { lines: { milk: { got: true, qty: 1, cents: 500 } }, pulled: [] } };
    const out = mergeGrocery(normGrocery({ stores: ['Aldi'], items: [] }), months, data);
    const milk = out.grocery.items.find(i => i.n === 'Milk')!;
    expect(milk.id).not.toBe('milk'); // the August purchase of an item that was removed here stays its own
    expect(out.months['2026-08'].lines.milk).toMatchObject({ got: true, cents: 500 });
  });
});
