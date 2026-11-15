import { describe, expect, it } from 'vitest';
import { mergeGroceryMonth3 } from './merge.js';

// Closed purchases (brief grocery-purchase-log) through the three-way merge of a grocery month.
const month = (lines: object) => ({ lines, pulled: [] });
const buy = { at: '2026-11-03T14:20', qty: 1, cents: 500, store: 'Aldi', share: { with: [] } };

describe('mergeGroceryMonth3 with closed purchases', () => {
  it('this device ran out of one item while the other ticked a different one: both stay', () => {
    const base = month({ milk: { got: true, at: '2026-11-03T14:20', qty: 1, cents: 500 } });
    const ours = month({ milk: { buys: [buy] } });
    const theirs = month({ milk: { got: true, at: '2026-11-03T14:20', qty: 1, cents: 500 }, rice: { got: true } });
    const m = mergeGroceryMonth3(base, ours, theirs).week;
    expect(m.lines.milk).toEqual({ buys: [buy] });
    expect(m.lines.rice).toEqual({ got: true });
  });
  it('a device that did not touch the line keeps the other device\'s closed purchases', () => {
    const base = month({ milk: { got: true, qty: 1, cents: 500 } });
    const theirs = month({ milk: { got: true, qty: 1, cents: 500, buys: [buy] } });
    const m = mergeGroceryMonth3(base, base, theirs).week;
    expect(m.lines.milk!.buys).toEqual([buy]);
  });
});
