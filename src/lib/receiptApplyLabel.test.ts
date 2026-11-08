import { describe, expect, it } from 'vitest';
import { applyLabel, applySummary, applyTotalCents, needsConfirm } from './receiptApplyLabel.js';

const plan = (over: Partial<Parameters<typeof applyLabel>[0]> = {}) => ({ items: 5, itemsCents: 3857, taxStore: 'Aldi' as string | null, untick: [] as string[], check: { taxCents: 212 }, ...over });

describe('applyLabel', () => {
  it('names the item count and the total, tax included only when a store is set for it', () => {
    expect(applyLabel(plan())).toBe('Apply 5 items, $40.69');
    expect(applyLabel(plan({ taxStore: null }))).toBe('Apply 5 items, $38.57');
    expect(applyTotalCents(plan())).toBe(4069);
  });
  it('uses the singular for one item', () => {
    expect(applyLabel(plan({ items: 1, itemsCents: 349, taxStore: null }))).toBe('Apply 1 item, $3.49');
  });
  it('says Move back when untick is all there is', () => {
    expect(applyLabel(plan({ items: 0, itemsCents: 0, taxStore: null, untick: ['a', 'b'] }))).toBe('Move 2 items back to Shopping');
    expect(applyLabel(plan({ items: 0, itemsCents: 0, taxStore: null, untick: ['a'] }))).toBe('Move 1 item back to Shopping');
    expect(applyLabel(plan({ items: 0, itemsCents: 0, untick: ['a'] }))).toBe('Apply 0 items, $2.12');
  });
});

describe('applySummary', () => {
  it('lists the items, tax, new items and items moving back', () => {
    expect(applySummary(plan(), 0, false)).toBe('5 items, $38.57 + Aldi tax $2.12.');
    expect(applySummary(plan({ taxStore: null, untick: ['a'] }), 1, false)).toBe('5 items, $38.57. 1 new item will be added. 1 will move back to Shopping.');
  });
  it('says when the total does not match', () => {
    expect(applySummary(plan(), 2, true)).toBe('5 items, $38.57 + Aldi tax $2.12. 2 new items will be added. The lines and tax do not match the receipt total.');
  });
});

describe('needsConfirm', () => {
  it('asks twice only when the lines and tax differ from a total on the receipt', () => {
    expect(needsConfirm({ diffCents: 800 })).toBe(true);
    expect(needsConfirm({ diffCents: -5 })).toBe(true);
    expect(needsConfirm({ diffCents: 0 })).toBe(false);
    expect(needsConfirm({ diffCents: null })).toBe(false);
  });
});
