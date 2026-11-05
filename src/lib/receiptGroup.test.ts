import { describe, expect, it } from 'vitest';
import type { GroceryItem } from '../types.ts';
import type { Receipt, ReceiptLine } from '../shared/receipt.js';
import { applyPlan, checkTotals, planReceipt, proposeItem, type Choice, type GroceryApi } from './groceryReceipt.js';
import { groupLines, mergeNote, rowAsLine, textKey } from './receiptGroup.js';

// Receipt: merge repeated lines (brief receipt-merge-lines). Rows are grouped by receipt text only; the plan and the totals still read the original lines.
const L = (text: string, grossCents: number, extra: Partial<ReceiptLine> = {}): ReceiptLine => ({ text, qty: 1, grossCents, discountCents: 0, matchId: null, ...extra });

describe('groupLines', () => {
  it('merges lines with the same text and the same price into one row: counts and totals add, each pack keeps its price', () => {
    const rows = groupLines([L('EGGS LRG', 899), L('MILK', 350), L('EGGS LRG', 899)]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ text: 'EGGS LRG', lines: [0, 2], qty: 2, grossCents: 1798, netCents: 1798, packs: [899, 899] });
    expect(rows[1]!.lines).toEqual([1]);
    expect(mergeNote(rows[0]!)).toBe('$8.99 each');
  });
  it('merges lines with different prices into one row and says each pack is at its own price', () => {
    const rows = groupLines([L('BEEF CHUCK ROAST', 1412), L('BEEF CHUCK ROAST', 1786)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 2, netCents: 3198, packs: [1412, 1786] });
    expect(mergeNote(rows[0]!)).toBe('2 packs, each at its own price: $14.12 + $17.86');
  });
  it('does not merge different texts, and gives a one-line row no note', () => {
    const rows = groupLines([L('EGGS', 500), L('EGGS XL', 500)]);
    expect(rows.map(r => r.lines)).toEqual([[0], [1]]);
    expect(mergeNote(rows[0]!)).toBe('');
  });
  it('ignores case and spacing in the receipt text', () => {
    expect(textKey('  Eggs   LRG ')).toBe('eggs lrg');
    expect(groupLines([L('EGGS LRG', 500), L(' eggs  lrg', 500)])).toHaveLength(1);
  });
  it('keeps lines apart when the scan matched them to different items, or only one of them to an item', () => {
    expect(groupLines([L('EGGS', 500, { matchId: 'a' }), L('EGGS', 500, { matchId: 'b' })]).map(r => r.lines)).toEqual([[0], [1]]);
    expect(groupLines([L('EGGS', 500, { matchId: 'a' }), L('EGGS', 500)]).map(r => r.lines)).toEqual([[0], [1]]);
    expect(groupLines([L('EGGS', 500, { matchId: 'a' }), L('EGGS', 500, { matchId: 'a' })]).map(r => r.lines)).toEqual([[0, 1]]);
  });
  it('uses the net price after a discount, and a line with its own count splits into packs that add up to its net', () => {
    const rows = groupLines([L('SODA', 1000, { discountCents: 200 }), L('SODA', 1000, { qty: 2 })]);
    expect(rows[0]).toMatchObject({ qty: 3, grossCents: 2000, discountCents: 200, netCents: 1800, packs: [800, 500, 500] });
    expect(rowAsLine(rows[0]!, [L('SODA', 1000, { discountCents: 200 }), L('SODA', 1000, { qty: 2 })])).toMatchObject({ text: 'SODA', qty: 3, grossCents: 2000, discountCents: 200 });
  });
  it('never merges weighed lines (a weight is not a pack count), and says so by leaving them as their own rows', () => {
    const rows = groupLines([L('BANANAS', 120, { qty: 1.2, unit: 'lb' }), L('BANANAS', 90, { qty: 0.9, unit: 'lb' })]);
    expect(rows.map(r => r.lines)).toEqual([[0], [1]]);
  });
  it('never merges lines with no price (returns, unattached discounts)', () => {
    expect(groupLines([L('COUPON', -100), L('COUPON', -100), L('FREE SAMPLE', 0), L('FREE SAMPLE', 0)]).map(r => r.lines)).toEqual([[0], [1], [2], [3]]);
  });
  it('keeps a text apart when its key is in the separate set, and merges the rest', () => {
    const lines = [L('EGGS', 500), L('RICE', 700), L('EGGS', 500), L('RICE', 700)];
    expect(groupLines(lines, new Set([textKey('EGGS')])).map(r => r.lines)).toEqual([[0], [1, 3], [2]]);
  });
  it('leaves the receipt totals check unchanged: it reads the lines, not the rows', () => {
    const receipt: Receipt = { totalCents: 3198, lines: [L('BEEF', 1412), L('BEEF', 1786)] };
    expect(groupLines(receipt.lines).reduce((a, r) => a + r.netCents, 0)).toBe(checkTotals(receipt).linesCents);
    expect(checkTotals(receipt).diffCents).toBe(0);
  });
});

describe('a merged row as one item', () => {
  const item = (id: string, n: string): GroceryItem => ({ id, n, store: "BJ's", qty: 1, cents: null, every: true, out: false });
  const items = [item('beef', 'Beef chuck roast'), item('eggs', 'Eggs')];
  const beef: Receipt = { store: "BJ's", totalCents: 3198, lines: [L('BEEF CHUCK ROAST', 1412), L('BEEF CHUCK ROAST', 1786)] };
  const both = (id: string): Choice[] => [{ itemId: id, include: true }, { itemId: id, include: true }];

  it('plans one item whose packs keep their own prices, the same as two lines on one item do today', () => {
    const p = planReceipt(beef, both('beef'), items, "BJ's");
    expect(p.steps).toEqual([{ kind: 'prices', id: 'beef', prices: [1412, 1786] }]);
    expect(p.items).toBe(1);
    expect(p.itemsCents).toBe(3198);
    expect(p.check.diffCents).toBe(0);
  });
  it('plans identical prices as one count and one price', () => {
    const eggs: Receipt = { lines: [L('EGGS', 899), L('EGGS', 899)] };
    expect(planReceipt(eggs, both('eggs'), items, null).steps).toEqual([{ kind: 'single', id: 'eggs', qty: 2, cents: 899 }]);
  });
  it('plans a staged item once, and applying it writes the prices through setGroceryPrices', () => {
    const staged = [{ id: 'new:1', n: 'Beef chuck roast', store: "BJ's", qty: 2, cents: 1599 }];
    const p = planReceipt(beef, both('new:1'), [], null, staged);
    expect(p.steps).toEqual([{ kind: 'prices', id: 'new:1', prices: [1412, 1786] }]);
    const calls: string[] = [];
    const api = { setGroceryGot: () => true, setGroceryPrices: (m: string, id: string, pr: number[]) => { calls.push(`prices ${id} ${pr}`); } } as unknown as GroceryApi;
    expect(applyPlan(p, '2026-11', api)).toBe(1);
    expect(calls).toEqual(['prices new:1 1412,1786']);
  });
  it('prefills Add to list with the summed count and the average unit price', () => {
    const row = groupLines(beef.lines)[0]!;
    expect(proposeItem(rowAsLine(row, beef.lines), "BJ's", ["BJ's"])).toMatchObject({ n: 'Beef chuck roast', qty: '2', price: '15.99', store: "BJ's" });
    const eggs = [L('EGGS', 899), L('EGGS', 899)];
    expect(proposeItem(rowAsLine(groupLines(eggs)[0]!, eggs), undefined, [])).toMatchObject({ qty: '2', price: '8.99' });
  });
});
