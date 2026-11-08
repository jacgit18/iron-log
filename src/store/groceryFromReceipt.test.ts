import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { normGroceryMonth } from '../shared/grocery.js';
import { applyPlan, planReceipt, type Choice } from '../lib/groceryReceipt.js';
import type { Receipt } from '../shared/receipt.js';

// Brief receipt-earlier-items: a tick written by a receipt's Apply carries `rc`, an untick or a hand tick does not, and the month cleaner keeps it only on a bought line.
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

describe('the receipt tick marker', () => {
  it('is set by markGroceryFromReceipt on a bought line only', () => {
    st().markGroceryFromReceipt('2026-11', riceId());
    expect(line()).toBeUndefined(); // not bought: nothing to mark
    st().setGroceryGot('2026-11', riceId(), true);
    expect(line()?.rc).toBeUndefined(); // a tick by hand has no marker
    st().markGroceryFromReceipt('2026-11', riceId());
    expect(line()?.rc).toBe(true);
  });
  it('is cleared when the item is unticked', () => {
    st().setGroceryGot('2026-11', riceId(), true);
    st().markGroceryFromReceipt('2026-11', riceId());
    st().setGroceryGot('2026-11', riceId(), false);
    expect(line()?.rc).toBeUndefined(); // the count and price stay, the receipt marker and the tick go
    expect(line()?.got).toBeUndefined();
  });
  it('is written by applyPlan for each item it ticks', () => {
    const id = riceId();
    const receipt: Receipt = { lines: [{ text: 'RICE 5LB', qty: 1, grossCents: 549, discountCents: 0, matchId: id }] };
    const choices: Choice[] = [{ itemId: id, include: true }];
    const plan = planReceipt(receipt, choices, st().grocery.items, null);
    applyPlan(plan, '2026-11', st() as never);
    expect(line()).toMatchObject({ got: true, rc: true });
  });
  it('survives the month cleaner on a bought line and is dropped from a line that is not bought', () => {
    const m = normGroceryMonth({ lines: { a: { got: true, rc: true }, b: { have: true, rc: true }, c: { got: true, rc: 'yes' } }, pulled: [] });
    expect(m.lines.a).toEqual({ got: true, rc: true });
    expect(m.lines.b).toEqual({ have: true });
    expect(m.lines.c).toEqual({ got: true });
  });
});
