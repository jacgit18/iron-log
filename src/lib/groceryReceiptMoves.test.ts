import { describe, expect, it } from 'vitest';
import type { Grocery, GroceryItem, GroceryLine } from '../types.ts';
import type { Receipt } from '../shared/receipt.js';
import { applyPlan, moveNote, movedText, movesText, planReceipt, restoreSnapshot, takeSnapshot, type Choice, type GroceryApi, type Where } from './groceryReceipt.js';

// Receipt bought-at store (brief receipt-bought-at): which items Apply marks as bought at the receipt's store, what the sheet says about it, and the writes and Undo.
const item = (id: string, n: string, store: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({ id, n, store, qty: 1, cents: null, every: true, out: false, ...extra });
const items = [item('eggs', 'Eggs', 'Aldi'), item('oil', 'Olive oil', ''), item('rice', 'Rice', "BJ's"), item('milk', 'Milk', 'Aldi', { share: { with: ['sam'] } }), item('nuts', 'Nuts', 'Aldi')];
const receipt: Receipt = { store: "BJ's", lines: [
  { text: 'EGGS', qty: 1, grossCents: 500, discountCents: 0, matchId: 'eggs' },
  { text: 'OIL', qty: 1, grossCents: 900, discountCents: 0, matchId: 'oil' },
  { text: 'RICE', qty: 1, grossCents: 700, discountCents: 0, matchId: 'rice' },
  { text: 'MILK', qty: 1, grossCents: 400, discountCents: 0, matchId: 'milk' },
] };
const all: Choice[] = receipt.lines.map(l => ({ itemId: l.matchId, include: true }));
const groups = [{ id: 'g1', n: 'Home', people: [{ id: 'sam', n: 'Sam' }], stores: ["BJ's"] }];
const g = (withGroups = false): Grocery => ({ stores: ['Aldi', "BJ's"], items, ...(withGroups ? { groups } : {}) });
const where = (extra: Partial<Where> = {}): Where => ({ at: "BJ's", makeUsual: false, g: g(), lines: {}, ...extra });

describe('planReceipt moves', () => {
  it('lists each ticked item that is not already bought at the receipt store, with where it was and where it usually is', () => {
    const p = planReceipt(receipt, all, items, null, [], where());
    expect(p.moves.map(m => [m.id, m.from, m.usual, m.to])).toEqual([['eggs', 'Aldi', 'Aldi', "BJ's"], ['oil', '', '', "BJ's"], ['milk', 'Aldi', 'Aldi', "BJ's"]]);
    expect(p.makeUsual).toBe(false);
  });
  it('has no moves when no store is known, and leaves out unticked and unmatched lines', () => {
    expect(planReceipt(receipt, all, items, null, [], where({ at: null })).moves).toEqual([]);
    expect(planReceipt(receipt, all, items, null).moves).toEqual([]);
    const some: Choice[] = [{ itemId: 'eggs', include: false }, { itemId: 'oil', include: true }, { itemId: null, include: false }, { itemId: 'milk', include: false }];
    expect(planReceipt(receipt, some, items, null, [], where()).moves.map(m => m.id)).toEqual(['oil']);
  });
  it('puts an item back when its usual store is the receipt store but this month it was moved elsewhere by hand', () => {
    const lines: Record<string, GroceryLine> = { rice: { store: 'Aldi' } };
    expect(planReceipt(receipt, all, items, null, [], where({ lines })).moves.find(m => m.id === 'rice')).toMatchObject({ from: 'Aldi', usual: "BJ's", to: "BJ's" });
  });
  it('is not fooled by letter case, and skips an item added from the sheet', () => {
    expect(planReceipt(receipt, all, items, null, [], where({ at: 'aldi' })).moves.map(m => m.id)).toEqual(['oil', 'rice']);
    const staged = [{ id: 'new:1', n: 'Soda', store: 'Aldi', qty: 1, cents: 500 }];
    const withNew = planReceipt({ lines: [{ text: 'SODA', qty: 1, grossCents: 500, discountCents: 0, matchId: null }] }, [{ itemId: 'new:1', include: true }], items, null, staged, where());
    expect(withNew.moves).toEqual([]);
  });
  it('makeUsual follows the checkbox only when something moves', () => {
    expect(planReceipt(receipt, all, items, null, [], where({ makeUsual: true })).makeUsual).toBe(true);
    expect(planReceipt(receipt, [{ itemId: 'rice', include: true }, ...all.slice(1).map(() => ({ itemId: null, include: false }))], items, null, [], where({ makeUsual: true })).makeUsual).toBe(false);
  });
  it('flags a split change only when the sharing group differs and neither the item nor its line has a split of its own', () => {
    const p = planReceipt(receipt, all, items, null, [], where({ g: g(true) }));
    expect(p.moves.map(m => [m.id, m.splitChanges])).toEqual([['eggs', true], ['oil', true], ['milk', false]]); // milk has its own split
    expect(planReceipt(receipt, all, items, null, [], where({ g: g(true), lines: { eggs: { share: { with: [] } } } })).moves.find(m => m.id === 'eggs')?.splitChanges).toBe(false);
    expect(planReceipt(receipt, all, items, null, [], where()).moves.every(m => !m.splitChanges)).toBe(true); // no groups: nothing changes
  });
});

describe('the words', () => {
  const p = planReceipt(receipt, all, items, null, [], where({ g: g(true) }));
  it('count the items, and name the split change only when there is one', () => {
    expect(movesText(p.moves)).toEqual({ summary: "3 items will be marked bought at BJ's this month.", split: "Moving 2 of these changes who shares them: the split follows the sharing group for BJ's." });
    expect(movesText(planReceipt(receipt, all, items, null, [], where()).moves).split).toBe('');
    expect(movesText([])).toEqual({ summary: '', split: '' });
    expect(movesText(p.moves.slice(0, 1)).summary).toBe("1 item will be marked bought at BJ's this month.");
  });
  it('write one row note, and the Applied sentence', () => {
    expect(moveNote(p.moves[0]!)).toBe("Bought at BJ's (usually Aldi)");
    expect(moveNote(p.moves[1]!)).toBe("Bought at BJ's (usually Anywhere)");
    expect(moveNote({ ...p.moves[0]!, usual: "BJ's" })).toBe("Bought at BJ's");
    expect(movedText(p.moves, false, [])).toBe(" 3 marked bought at BJ's.");
    expect(movedText(p.moves, true, ['Milk (that name is taken)'])).toBe(" 3 marked bought at BJ's (BJ's is now their usual store except Milk (that name is taken)).");
    expect(movedText([], true, [])).toBe('');
  });
});

describe('applyPlan with moves, and Undo', () => {
  const makeApi = (refuse: string[] = []) => {
    const calls: string[] = [];
    const api: GroceryApi = {
      setGroceryGot: (m, id) => { calls.push(`got ${id}`); return true; },
      setGroceryQty: (m, id, q) => { calls.push(`qty ${id} ${q}`); },
      setGroceryCents: (m, id, c) => { calls.push(`cents ${id} ${c}`); },
      setGroceryPrices: () => {},
      setGroceryTax: () => {},
      restoreGroceryLine: (m, id, l) => { calls.push(`restore ${id} ${JSON.stringify(l)}`); },
      updateGroceryItem: (id, patch) => { calls.push(`item ${id} ${JSON.stringify(patch)}`); return null; },
      removeGroceryItem: () => {},
      setGroceryLineStore: (m, id, store) => { calls.push(`at ${id} ${store}`); return null; },
      makeGroceryStoreUsual: (m, id) => { calls.push(`usual ${id}`); return refuse.includes(id) ? 'That item is already in that store.' : null; },
    };
    return { api, calls };
  };
  const one = (extra: Partial<Where> = {}) => planReceipt({ lines: [{ text: 'EGGS', qty: 1, grossCents: 500, discountCents: 0, matchId: 'eggs' }] }, [{ itemId: 'eggs', include: true }], items, null, [], where(extra));

  it('marks the item bought at the store right after ticking it, before its price', () => {
    const { api, calls } = makeApi();
    expect(applyPlan(one(), '2026-11', api)).toBe(1);
    expect(calls).toEqual(['got eggs', "at eggs BJ's", 'qty eggs 1', 'cents eggs 500']);
  });
  it('with makeUsual also makes the store usual, and names an item that was refused (its month line stays at the store)', () => {
    const { api, calls } = makeApi(['eggs']);
    const out = { refused: [] as string[] };
    applyPlan(one({ makeUsual: true }), '2026-11', api, out);
    expect(calls).toEqual(['got eggs', "at eggs BJ's", 'qty eggs 1', 'cents eggs 500', 'usual eggs']);
    expect(out.refused).toEqual(['Eggs (That item is already in that store.)']);
  });
  it('writes no store step when nothing moves, so a receipt without a known store applies as before', () => {
    const { api, calls } = makeApi();
    applyPlan(one({ at: null }), '2026-11', api);
    expect(calls).toEqual(['got eggs', 'qty eggs 1', 'cents eggs 500']);
  });
  it('Undo puts the line back, and the usual store only when Apply changed it', () => {
    const lines: Record<string, GroceryLine> = { eggs: { got: true } };
    const without = takeSnapshot(one(), '2026-11', lines, items, undefined);
    expect(without.usual.eggs).toEqual({ qty: 1, cents: null });
    const withUsual = takeSnapshot(one({ makeUsual: true }), '2026-11', lines, items, undefined);
    expect(withUsual.usual.eggs).toEqual({ qty: 1, cents: null, store: 'Aldi' });
    const { api, calls } = makeApi();
    restoreSnapshot(withUsual, api);
    expect(calls).toEqual(['item eggs {"qty":1,"cents":null,"store":"Aldi"}', 'restore eggs {"got":true}']); // the usual store first, so the line put back is not pinned to the receipt store
  });
});
