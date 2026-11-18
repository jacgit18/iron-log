import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { applyPlan, planReceipt, restoreSnapshot, takeSnapshot, withoutReceiptMoney, type Choice } from '../lib/groceryReceipt.js';
import { duplicateOf } from '../lib/groceryLedger.js';
import type { Receipt } from '../shared/receipt.js';
import { normGroceryMonth, monthEmpty } from '../shared/grocery.js';

// Brief receipt-tax-adds-up: the real store, Apply and Undo run as the review sheet runs them.
type Store = typeof import('./useAppStore.js').useAppStore;
let useAppStore: Store; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

const MK = '2026-11';
const receipt = (date: string, tax: number, rewards = 0): Receipt => ({ store: "BJ's", date, taxCents: tax, totalCents: 5000 + tax, ...(rewards ? { rewardsCents: rewards } : {}), lines: [{ text: 'EGGS', qty: 1, grossCents: 5000, discountCents: 0, matchId: 'x' }] });
const apply = (r: Receipt, id: string, mkSkip = false) => {
  const choice: Choice[] = [{ itemId: id, include: true }];
  let plan = planReceipt(r, choice, st().grocery.items, "BJ's");
  if (mkSkip) plan = withoutReceiptMoney(plan);
  const m = st().groceryMonths[MK];
  const snap = takeSnapshot(plan, MK, m?.lines ?? {}, st().grocery.items, m?.tax, [], m?.credit);
  applyPlan(plan, MK, st());
  return { plan, snap };
};
const setup = () => { st().addGroceryItem({ n: 'Eggs', store: "BJ's", qty: '1', price: '4.00', every: true }); return st().grocery.items[0]!.id; };

describe('two receipts from one store in one month', () => {
  it('add their tax and rewards instead of the second replacing the first', () => {
    const id = setup();
    apply(receipt('2026-11-03', 679, 1727), id);
    apply(receipt('2026-11-20', 352, 100), id);
    const m = st().groceryMonths[MK]!;
    expect(m.tax).toEqual({ "BJ's": 1031 });
    expect(m.credit).toEqual({ "BJ's": 1827 });
    expect(Object.keys(m.rcpts ?? {})).toHaveLength(2);
  });
  it('Undo of the second leaves the first, also after the box was typed, and the receipt can go in again', () => {
    const id = setup();
    apply(receipt('2026-11-03', 679), id);
    const { snap } = apply(receipt('2026-11-20', 352), id);
    st().setGroceryTax(MK, "BJ's", 2000); // typed by hand in between: the month's total for the store
    restoreSnapshot(snap, st());
    expect(st().groceryMonths[MK]!.tax).toEqual({ "BJ's": 1648 });
    restoreSnapshot(snap, st()); // a second Undo changes nothing
    expect(st().groceryMonths[MK]!.tax).toEqual({ "BJ's": 1648 });
    apply(receipt('2026-11-20', 352), id);
    expect(st().groceryMonths[MK]!.tax).toEqual({ "BJ's": 2000 });
  });
  it('a receipt applied again is noticed, and skipping its money changes nothing but the items', () => {
    const id = setup();
    const { plan } = apply(receipt('2026-11-03', 679), id);
    expect(duplicateOf(st().groceryMonths[MK]!.rcpts, plan.receiptKey!)).toBe(plan.receiptKey);
    apply(receipt('2026-11-03', 679), id, true);
    expect(st().groceryMonths[MK]!.tax).toEqual({ "BJ's": 679 });
    expect(st().applyGroceryReceiptMoney(MK, plan.receiptKey!, "BJ's", 679, 0)).toBe(false); // a double tap on Apply adds nothing
  });
  it('the manual Tax and Rewards boxes still set the month total', () => {
    const id = setup();
    apply(receipt('2026-11-03', 679, 100), id);
    st().setGroceryTax(MK, "BJ's", 1234); st().setGroceryCredit(MK, "BJ's", null);
    expect(st().groceryMonths[MK]!.tax).toEqual({ "BJ's": 1234 });
    expect(st().groceryMonths[MK]!.credit).toBeUndefined();
  });
});

describe('the ledger is cleaned and saved with the month', () => {
  it('round trips, drops junk, and keeps a month that holds only a ledger', () => {
    const raw = { lines: {}, pulled: [], rcpts: { "BJ's|d|1|2": { store: "BJ's", tax: 200 }, bad: { store: '', tax: 5 }, zero: { store: 'A', tax: 0 }, __proto__: { store: 'A', tax: 1 } } };
    const m = normGroceryMonth(raw);
    expect(m.rcpts).toEqual({ "BJ's|d|1|2": { store: "BJ's", tax: 200 } });
    expect(normGroceryMonth(m)).toEqual(m);
    expect(monthEmpty(m)).toBe(false);
  });
});
