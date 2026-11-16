import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { applyPlan, planReceipt } from '../lib/groceryReceipt.js';
import { applyShares, shareWrites, NO_CHOICES, setWhole } from '../lib/receiptShare.js';

// Brief receipt-share: a receipt's split is written into the month's line only; the item's usual split stays, and Undo (restoreGroceryLine) puts the line back.
let useAppStore: typeof import('./useAppStore.js').useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
  st().addGroceryStore('Aldi');
  st().addGroceryItem({ n: 'Rice', store: 'Aldi', qty: '1', price: '5.49', every: true });
});
const riceId = () => st().grocery.items.find(i => i.n === 'Rice')!.id;
const line = () => st().groceryMonths['2026-11']?.lines[riceId()];

describe('setGroceryReceiptShare', () => {
  it('sets the line share and leaves the item usual split alone', () => {
    st().setGroceryReceiptShare('2026-11', riceId(), { with: ['sam'] });
    expect(line()?.share).toEqual({ with: ['sam'] });
    expect(st().grocery.items.find(i => i.id === riceId())?.share).toBeUndefined(); // setGroceryLineShare would have made this the usual
  });
  it('null clears it, and a missing item is ignored', () => {
    st().setGroceryReceiptShare('2026-11', riceId(), { with: ['sam'] });
    st().setGroceryReceiptShare('2026-11', riceId(), null);
    expect(line()?.share).toBeUndefined();
    st().setGroceryReceiptShare('2026-11', 'nope', { with: [] });
    expect(Object.keys(st().groceryMonths['2026-11']?.lines ?? {})).toEqual([]);
  });
  it('is written after the receipt plan for each applied line, and Undo restores the line', () => {
    const id = riceId();
    const receipt = { lines: [{ text: 'RICE 5LB', qty: 1, grossCents: 549, discountCents: 0, matchId: id }] };
    const choices = [{ itemId: id, include: true }];
    const plan = planReceipt(receipt, choices, st().grocery.items, null);
    const before = structuredClone(st().groceryMonths['2026-11']?.lines[id] ?? null);
    applyPlan(plan, '2026-11', st());
    applyShares(shareWrites(setWhole(NO_CHOICES, { with: ['sam'] }), [{ key: 'a', itemId: id, include: true, cents: 549 }]), '2026-11', st());
    expect(line()?.got).toBe(true);
    expect(line()?.share).toEqual({ with: ['sam'] });
    st().restoreGroceryLine('2026-11', id, before);
    expect(line()).toBeUndefined();
  });
});
