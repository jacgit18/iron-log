import { describe, expect, it } from 'vitest';
import type { GroceryItem, GroceryLine } from '../types.ts';
import type { Receipt } from '../shared/receipt.js';
import { applyPlan, checkText, checkTotals, matchStore, planReceipt, restoreSnapshot, splitCents, takeSnapshot, type Choice, type GroceryApi } from './groceryReceipt.js';

const item = (id: string, n: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({ id, n, store: "BJ's", qty: 1, cents: null, every: true, out: false, ...extra });
const items = [item('chicken', 'Chicken breast', { unit: 'lb' }), item('oil', 'Kirkland olive oil'), item('eggs', 'Eggs'), item('bananas', 'Bananas', { unit: 'lb' }), item('towels', 'Paper towels'), item('milk', 'Milk', { store: 'Aldi' })];

// The BJ's-style example from the preview: instant savings under two lines, two lines the list does not have, tax on the paper towels.
const receipt: Receipt = { store: 'BJS WHOLESALE CLUB', taxCents: 204, totalCents: 9781, lines: [
  { text: 'WLSLY FRM CHKN BRST', qty: 5, unit: 'lb', grossCents: 2245, discountCents: 250, matchId: 'chicken' },
  { text: 'KS EXTRA VIRGIN OL 2L', qty: 1, grossCents: 1899, discountCents: 400, matchId: 'oil' },
  { text: 'EGGS LRG 5 DZ', qty: 2, grossCents: 2698, discountCents: 0, matchId: 'eggs' },
  { text: 'BANANAS', qty: 3, unit: 'lb', grossCents: 177, discountCents: 0, matchId: 'bananas' },
  { text: 'KS PAPER TOWEL 12CT', qty: 1, grossCents: 2299, discountCents: 0, matchId: 'towels' },
  { text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 899, discountCents: 0, matchId: null },
  { text: 'BAG FEE', qty: 1, grossCents: 10, discountCents: 0, matchId: null },
] };
const matched: Choice[] = receipt.lines.map(l => ({ itemId: l.matchId, include: !!l.matchId }));

describe('splitCents', () => {
  it('adds up exactly, with the odd cents on the first packs', () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(splitCents(2698, 2)).toEqual([1349, 1349]);
    expect(splitCents(0, 2)).toEqual([0, 0]);
  });
});

describe('matchStore', () => {
  it('finds the catalogue store whose name is inside the receipt name or the other way round', () => {
    expect(matchStore('BJS WHOLESALE CLUB', ["BJ's", 'Aldi'])).toBe("BJ's");
    expect(matchStore("ALDI #44", ["BJ's", 'Aldi'])).toBe('Aldi');
    expect(matchStore('Whole Foods Market', ['Whole Foods'])).toBe('Whole Foods');
    expect(matchStore('SAMS CLUB 6612', ["BJ's", 'Aldi'])).toBeNull();
    expect(matchStore(undefined, ['Aldi'])).toBeNull();
    expect(matchStore('AB', ['Aldi'])).toBeNull();
  });
});

describe('checkTotals and checkText', () => {
  it('explains the whole total when lines and tax add up', () => {
    const c = checkTotals(receipt);
    expect(c).toEqual({ linesCents: 9577, taxCents: 204, totalCents: 9781, diffCents: 0 });
    expect(checkText(c)).toEqual({ ok: true, text: 'Total check: lines plus tax match the receipt.' });
  });
  it('says what is missing, or extra, and when there is no total', () => {
    expect(checkText(checkTotals({ ...receipt, totalCents: 9931 }))).toMatchObject({ ok: false });
    expect(checkText(checkTotals({ ...receipt, totalCents: 9931 })).text).toContain('$1.50 on the receipt is not in the lines');
    expect(checkText(checkTotals({ ...receipt, totalCents: 9700 })).text).toContain('$0.81 in the lines is more than the receipt total');
    const { totalCents: _t, ...noTotal } = receipt;
    expect(checkText(checkTotals(noTotal)).ok).toBe(true);
  });
});

describe('planReceipt', () => {
  const plan = planReceipt(receipt, matched, items, 'BJ\'s');
  it('applies a discount to its item, writes weighed items as a weight and a price per unit, and equal packs as a count and price', () => {
    expect(plan.steps).toEqual([
      { kind: 'single', id: 'chicken', qty: 5, cents: 399 }, // 22.45 - 2.50 = 19.95 for 5 lb
      { kind: 'single', id: 'oil', qty: 1, cents: 1499 },
      { kind: 'single', id: 'eggs', qty: 2, cents: 1349 },
      { kind: 'single', id: 'bananas', qty: 3, cents: 59 },
      { kind: 'single', id: 'towels', qty: 1, cents: 2299 },
      { kind: 'tax', store: "BJ's", cents: 204 },
    ]);
    expect(plan.items).toBe(5);
    expect(plan.itemsCents).toBe(8668);
    expect(plan.taxStore).toBe("BJ's");
  });
  it('writes nothing for an unmatched, unticked or negative line, and the check still counts them', () => {
    const none = planReceipt(receipt, receipt.lines.map(() => ({ itemId: null, include: true })), items, null);
    expect(none.steps).toEqual([]);
    expect(none.check.diffCents).toBe(0);
    const unticked = planReceipt(receipt, matched.map((c, i) => (i === 0 ? { ...c, include: false } : c)), items, null);
    expect(unticked.steps.some(s => s.kind !== 'tax' && s.id === 'chicken')).toBe(false);
    const neg = planReceipt({ ...receipt, lines: [{ text: 'RETURN', qty: 1, grossCents: -500, discountCents: 0, matchId: null }] }, [{ itemId: 'eggs', include: true }], items, null);
    expect(neg.steps).toEqual([]);
  });
  it('turns packs at different net prices into prices that add up to the net total to the cent', () => {
    const r: Receipt = { lines: [{ text: 'OIL 3PK', qty: 3, grossCents: 4000, discountCents: 1000, matchId: 'oil' }] };
    const p = planReceipt(r, [{ itemId: 'oil', include: true }], items, null);
    expect(p.steps).toEqual([{ kind: 'single', id: 'oil', qty: 3, cents: 1000 }]);
    const odd: Receipt = { lines: [{ text: 'OIL 3PK', qty: 3, grossCents: 3001, discountCents: 0, matchId: 'oil' }] };
    const q = planReceipt(odd, [{ itemId: 'oil', include: true }], items, null);
    expect(q.steps).toEqual([{ kind: 'prices', id: 'oil', prices: [1001, 1000, 1000] }]);
    expect(q.itemsCents).toBe(3001);
  });
  it('adds up two lines for one item, mixing prices into one list', () => {
    const r: Receipt = { lines: [{ text: 'EGGS', qty: 1, grossCents: 1349, discountCents: 0, matchId: 'eggs' }, { text: 'EGGS', qty: 1, grossCents: 1199, discountCents: 0, matchId: 'eggs' }] };
    const p = planReceipt(r, [{ itemId: 'eggs', include: true }, { itemId: 'eggs', include: true }], items, null);
    expect(p.steps).toEqual([{ kind: 'prices', id: 'eggs', prices: [1349, 1199] }]);
    expect(p.items).toBe(1);
  });
  it('lets the person move a line to another item, and skips an item the list no longer has', () => {
    const moved = planReceipt(receipt, matched.map((c, i) => (i === 5 ? { itemId: 'milk', include: true } : c)), items, null);
    expect(moved.steps).toContainEqual({ kind: 'single', id: 'milk', qty: 1, cents: 899 });
    const gone = planReceipt(receipt, matched.map((c, i) => (i === 0 ? { itemId: 'deleted', include: true } : c)), items, null);
    expect(gone.steps.some(s => s.kind !== 'tax' && s.id === 'deleted')).toBe(false);
  });
  it('sets no tax without a store or a tax amount', () => {
    expect(planReceipt(receipt, matched, items, null).steps.some(s => s.kind === 'tax')).toBe(false);
    expect(planReceipt({ ...receipt, taxCents: 0 }, matched, items, "BJ's").taxStore).toBeNull();
  });
});

describe('applyPlan and restoreSnapshot', () => {
  const makeApi = () => {
    const calls: string[] = [];
    const api: GroceryApi = {
      setGroceryGot: (m, id, on) => { calls.push(`got ${m} ${id} ${on}`); return true; },
      setGroceryQty: (m, id, q) => { calls.push(`qty ${id} ${q}`); },
      setGroceryCents: (m, id, c) => { calls.push(`cents ${id} ${c}`); },
      setGroceryPrices: (m, id, p) => { calls.push(`prices ${id} ${p?.join(',')}`); },
      setGroceryTax: (m, s, c) => { calls.push(`tax ${s} ${c}`); },
      restoreGroceryLine: (m, id, l) => { calls.push(`restore ${id} ${JSON.stringify(l)}`); },
      updateGroceryItem: (id, patch) => { calls.push(`usual ${id} ${JSON.stringify(patch)}`); return null; },
    };
    return { api, calls };
  };
  it('ticks each item bought before its count and price, then the tax', () => {
    const { api, calls } = makeApi();
    const odd = planReceipt({ lines: [{ text: 'OIL 3PK', qty: 3, grossCents: 3001, discountCents: 0, matchId: 'oil' }], taxCents: 50 }, [{ itemId: 'oil', include: true }], items, "BJ's");
    expect(applyPlan(odd, '2026-11', api)).toBe(1);
    expect(calls).toEqual(['got 2026-11 oil true', 'prices oil 1001,1000,1000', "tax BJ's 50"]);
  });
  it('counts only the items written when sync is still loading', () => {
    const { api } = makeApi();
    api.setGroceryGot = () => false;
    expect(applyPlan(planReceipt(receipt, matched, items, null), '2026-11', api)).toBe(0);
  });
  it('puts each touched line, usual price and the tax back as they were', () => {
    const lines: Record<string, GroceryLine> = { eggs: { got: true, qty: 1, cents: 1100 } };
    const priced = [item('eggs', 'Eggs', { qty: 1, cents: 1100 }), item('oil', 'Kirkland olive oil', { qty: 2, cents: null })];
    const p = planReceipt({ lines: [{ text: 'EGGS', qty: 2, grossCents: 2698, discountCents: 0, matchId: 'eggs' }, { text: 'OIL', qty: 1, grossCents: 1499, discountCents: 0, matchId: 'oil' }], taxCents: 204 }, [{ itemId: 'eggs', include: true }, { itemId: 'oil', include: true }], priced, "BJ's");
    const snap = takeSnapshot(p, '2026-11', lines, priced, { "BJ's": 150 });
    expect(snap).toEqual({ month: '2026-11', lines: { eggs: { got: true, qty: 1, cents: 1100 }, oil: null }, usual: { eggs: { qty: 1, cents: 1100 }, oil: { qty: 2, cents: null } }, tax: { store: "BJ's", cents: 150 } });
    const { api, calls } = makeApi();
    restoreSnapshot(snap, api);
    expect(calls).toEqual(['restore eggs {"got":true,"qty":1,"cents":1100}', 'restore oil null', 'usual eggs {"qty":1,"cents":1100}', 'usual oil {"qty":2,"cents":null}', "tax BJ's 150"]);
  });
});
