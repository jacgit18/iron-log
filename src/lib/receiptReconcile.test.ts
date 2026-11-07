import { describe, expect, it } from 'vitest';
import type { GroceryItem, GroceryLine } from '../types.ts';
import type { Receipt, ReceiptLine } from '../shared/receipt.js';
import { applyPlan, planReceipt, restoreSnapshot, takeSnapshot, type Choice, type GroceryApi, type Staged } from './groceryReceipt.js';
import { heldOf, missingIntro, reconcile, untickedText } from './receiptReconcile.js';

// Receipt: reconcile items already ticked in the store (brief receipt-reconcile-ticked).
const item = (id: string, n: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({ id, n, store: 'Costco', qty: 1, cents: null, every: true, out: false, ...extra });
const L = (text: string, grossCents: number, matchId: string | null, extra: Partial<ReceiptLine> = {}): ReceiptLine => ({ text, qty: 1, grossCents, discountCents: 0, matchId, ...extra });
const choose = (r: Receipt): Choice[] => r.lines.map(l => ({ itemId: l.matchId, include: !!l.matchId }));
const run = (r: Receipt, items: GroceryItem[], lines: Record<string, GroceryLine>, choices: Choice[] = choose(r)) => reconcile(planReceipt(r, choices, items, null), choices, items, lines);

describe('heldOf', () => {
  const eggs = item('eggs', 'Eggs', { qty: 2, cents: 500 });
  it('is null for a line that is not ticked', () => {
    expect(heldOf(undefined, eggs)).toBeNull();
    expect(heldOf({ have: true }, eggs)).toBeNull();
  });
  it('reads a ticked line the way the month totals do: its own count and price, else the item\'s, or no price when bought unpriced', () => {
    expect(heldOf({ got: true, qty: 3, cents: 450 }, eggs)).toEqual({ qty: 3, cents: 450, prices: null });
    expect(heldOf({ got: true }, eggs)).toEqual({ qty: 2, cents: 500, prices: null });
    expect(heldOf({ got: true, unpriced: true }, eggs)).toEqual({ qty: 2, cents: null, prices: null });
    expect(heldOf({ got: true, prices: [899, 1049] }, eggs)).toEqual({ qty: 2, cents: null, prices: [899, 1049] });
  });
});

describe('reconcile: was and now for a ticked item', () => {
  const items = [item('eggs', 'Eggs'), item('chicken', 'Rotisserie chicken'), item('water', 'Water 40-pack'), item('almonds', 'Almonds', { cents: 1199 })];
  const r: Receipt = { lines: [L('ORG EGGS 18CT', 899, 'eggs'), L('ROTISSERIE CHKN', 499, 'chicken'), L('KS WATER 40PK', 898, 'water', { qty: 2 }), L('ALMONDS 3LB', 1249, 'almonds')] };
  const lines: Record<string, GroceryLine> = { eggs: { got: true, unpriced: true, qty: 1 }, chicken: { got: true, qty: 1, cents: 429 }, water: { got: true, qty: 1, cents: 449 } };
  const out = run(r, items, lines);
  it('says a ticked item with no price gets one', () => {
    expect(out.compare.eggs).toEqual({ id: 'eggs', was: 'no price', now: '1 × $8.99', label: 'Price added', same: false });
  });
  it('says the price changed, and the count changed', () => {
    expect(out.compare.chicken).toMatchObject({ was: '1 × $4.29', now: '1 × $4.99', label: 'Price changed', same: false });
    expect(out.compare.water).toMatchObject({ was: '1 × $4.49', now: '2 × $4.49', label: 'Count changed', same: false });
  });
  it('has nothing for an item that was not ticked', () => {
    expect(out.compare.almonds).toBeUndefined();
  });
  it('says the list matches when count and price are already the same', () => {
    const c = run(r, items, { chicken: { got: true, qty: 1, cents: 499 } }).compare.chicken!;
    expect(c).toMatchObject({ label: 'Matches the list', same: true });
  });
  it('says both changed', () => {
    expect(run(r, items, { water: { got: true, qty: 1, cents: 399 } }).compare.water).toMatchObject({ label: 'Price and count changed' });
  });
  it('keeps the old count visible when an unpriced line also changes count', () => {
    const c = run(r, items, { eggs: { got: true, unpriced: true, qty: 3 } }).compare.eggs!;
    expect(c).toMatchObject({ was: '3, no price', now: '1 × $8.99', label: 'Price added, count changed' });
  });
  it('compares per-pack prices, a weighed item and a pack count', () => {
    const beef = item('beef', 'Beef chuck roast');
    const rb: Receipt = { lines: [L('BEEF CHUCK ROAST', 1412, 'beef'), L('BEEF CHUCK ROAST', 1786, 'beef')] };
    expect(run(rb, [beef], { beef: { got: true, qty: 1, cents: 1500 } }).compare.beef).toMatchObject({ was: '1 × $15.00', now: '2 packs: $14.12 + $17.86', label: 'Price and count changed' });
    expect(run(rb, [beef], { beef: { got: true, prices: [1412, 1786] } }).compare.beef).toMatchObject({ was: '2 packs: $14.12 + $17.86', label: 'Matches the list', same: true });
    const ban = item('ban', 'Bananas', { unit: 'lb' });
    const rw: Receipt = { lines: [L('BANANAS', 177, 'ban', { qty: 3, unit: 'lb' })] };
    expect(run(rw, [ban], { ban: { got: true, qty: 2, cents: 50 } }).compare.ban).toMatchObject({ was: '2 lb at $0.50 per lb', now: '3 lb at $0.59 per lb', label: 'Price and count changed' });
  });
  it('has no was for a staged item, and skips an item the list no longer has', () => {
    const staged: Staged = { id: 'new:1', n: 'Zevia', store: 'Costco', qty: 1, cents: null };
    const rs: Receipt = { lines: [L('ZEVIA', 899, 'new:1'), L('GONE', 100, 'gone')] };
    const choices = choose(rs);
    const p = planReceipt(rs, choices, [], null, [staged]);
    expect(reconcile(p, choices, [], {}).compare).toEqual({});
  });
});

describe('reconcile: ticked items the receipt does not show', () => {
  const items = [item('eggs', 'Eggs'), item('milk', 'Milk', { cents: 379 }), item('towels', 'Paper towels'), item('almonds', 'Almonds')];
  const r: Receipt = { lines: [L('ORG EGGS', 899, 'eggs'), L('ALMONDS', 1249, 'almonds')] };
  const lines: Record<string, GroceryLine> = { eggs: { got: true }, milk: { got: true, qty: 1, cents: 379 }, towels: { got: true, unpriced: true }, almonds: { have: true } };
  it('lists a ticked item no included line is matched to, with what it holds, and not an unticked or have item', () => {
    const out = run(r, items, lines);
    expect(out.missing).toEqual([{ id: 'milk', name: 'Milk', held: '1 × $3.79' }, { id: 'towels', name: 'Paper towels', held: 'no price' }]);
    expect(out.ticked).toBe(3);
  });
  it('lists an item whose receipt line the person left out, and not one whose line was only skipped by the plan', () => {
    const choices = choose(r).map((c, i) => (i === 0 ? { ...c, include: false } : c));
    expect(run(r, items, lines, choices).missing.map(m => m.id)).toEqual(['eggs', 'milk', 'towels']);
  });
  it('with the receipt\'s store known, leaves out ticked items counted at another store, and keeps Anywhere and that store\'s', () => {
    const shop = [item('eggs', 'Eggs', { store: 'Costco' }), item('milk', 'Milk', { store: 'Aldi', cents: 379 }), item('towels', 'Paper towels', { store: '' }), item('rice', 'Rice', { store: 'Aldi' })];
    const rs: Receipt = { lines: [L('SOMETHING', 100, null)] };
    const here: Record<string, GroceryLine> = { eggs: { got: true }, milk: { got: true }, towels: { got: true }, rice: { got: true, store: 'Costco' } };
    const choices = choose(rs);
    const out = reconcile(planReceipt(rs, choices, shop, null), choices, shop, here, 'costco');
    expect(out.missing.map(m => m.id)).toEqual(['eggs', 'towels', 'rice']); // Milk is counted at Aldi; Rice is Aldi's but this month's line says Costco
    expect(out.ticked).toBe(3);
    expect(reconcile(planReceipt(rs, choices, shop, null), choices, shop, here).missing).toHaveLength(4); // no store known: every ticked item
  });
  it('lists nothing when nothing is ticked, and warns when every ticked item is missing', () => {
    expect(run(r, items, {}).missing).toEqual([]);
    const wrong: Receipt = { lines: [L('SOMETHING ELSE', 100, null)] };
    const out = run(wrong, items, lines);
    expect(out.missing).toHaveLength(3);
    expect(missingIntro(out)).toMatch(/^None of the items you marked bought are on this receipt/);
    expect(missingIntro(run(r, items, lines))).toMatch(/^You marked these as bought/);
  });
  it('words the unticked count for the Applied notice', () => {
    expect(untickedText(0)).toBe('');
    expect(untickedText(1)).toBe(' 1 item moved back to to-get.');
    expect(untickedText(2)).toBe(' 2 items moved back to to-get.');
  });
});

describe('apply and Undo with unticked items', () => {
  const items = [item('eggs', 'Eggs'), item('milk', 'Milk', { cents: 379 })];
  const lines: Record<string, GroceryLine> = { eggs: { got: true, unpriced: true, qty: 1 }, milk: { got: true, qty: 1, cents: 379 } };
  const r: Receipt = { lines: [L('ORG EGGS', 899, 'eggs')] };
  const makeApi = () => {
    const calls: string[] = [];
    const api: GroceryApi = {
      setGroceryGot: (m, id, on) => { calls.push(`got ${id} ${on}`); return true; },
      setGroceryQty: (m, id, q) => { calls.push(`qty ${id} ${q}`); },
      setGroceryCents: (m, id, c) => { calls.push(`cents ${id} ${c}`); },
      setGroceryPrices: (m, id, p) => { calls.push(`prices ${id} ${p?.join(',')}`); },
      setGroceryTax: (m, s, c) => { calls.push(`tax ${s} ${c}`); },
      restoreGroceryLine: (m, id, l) => { calls.push(`restore ${id} ${JSON.stringify(l)}`); },
      updateGroceryItem: (id, patch) => { calls.push(`usual ${id} ${JSON.stringify(patch)}`); return null; },
      removeGroceryItem: (id, opts) => { calls.push(`remove ${id} ${opts?.quiet ? 'quiet' : 'loud'}`); },
      setGroceryLineStore: (m, id, store) => { calls.push(`at ${id} ${store}`); return null; },
      makeGroceryStoreUsual: (m, id) => { calls.push(`make usual ${id}`); return null; },
    };
    return { api, calls };
  };
  const plan = { ...planReceipt(r, choose(r), items, null), untick: ['milk'] };
  it('prices the ticked item with no price and unticks the chosen one, counting it apart from the items', () => {
    const { api, calls } = makeApi();
    const out: { refused: string[]; unticked?: number } = { refused: [] };
    expect(applyPlan(plan, '2026-11', api, out)).toBe(1);
    expect(calls).toEqual(['got eggs true', 'qty eggs 1', 'cents eggs 899', 'got milk false']);
    expect(out.unticked).toBe(1);
  });
  it('leaves a missing item alone when it is not chosen', () => {
    const { api, calls } = makeApi();
    applyPlan(planReceipt(r, choose(r), items, null), '2026-11', api);
    expect(calls).not.toContain('got milk false');
  });
  it('puts the priced line and the unticked line back exactly as they were', () => {
    const snap = takeSnapshot(plan, '2026-11', lines, items, undefined);
    expect(snap.lines).toEqual({ eggs: { got: true, unpriced: true, qty: 1 }, milk: { got: true, qty: 1, cents: 379 } });
    const { api, calls } = makeApi();
    restoreSnapshot(snap, api);
    expect(calls).toContain('restore milk {"got":true,"qty":1,"cents":379}');
    expect(calls).toContain('restore eggs {"got":true,"unpriced":true,"qty":1}');
  });
  it('only unticking (no receipt line included) still has something to apply', () => {
    const none = { ...planReceipt(r, [{ itemId: 'eggs', include: false }], items, null), untick: ['milk'] };
    expect(none.steps).toEqual([]);
    expect(none.untick).toEqual(['milk']);
  });
});
