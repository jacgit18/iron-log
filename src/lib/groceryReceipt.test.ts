import { describe, expect, it } from 'vitest';
import type { GroceryItem, GroceryLine } from '../types.ts';
import type { Receipt } from '../shared/receipt.js';
import { addedText, applyPlan, checkText, checkTotals, convertWeight, createStaged, matchStore, planReceipt, proposeItem, remapPlan, restoreSnapshot, splitCents, stageDraft, takeSnapshot, tidyName, type Choice, type GroceryApi, type Staged } from './groceryReceipt.js';

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

describe('weights in another unit, and lines sold by count', () => {
  const kgItems = [item('beef', 'Ground beef', { unit: 'kg' }), item('rice', 'Rice', { unit: 'lb' }), item('soap', 'Soap')];
  const one = (l: Partial<Receipt['lines'][number]>, id: string) => planReceipt({ lines: [{ text: 'X', qty: 1, grossCents: 1000, discountCents: 0, matchId: id, ...l }] }, [{ itemId: id, include: true }], kgItems, null);
  it('converts pounds and ounces to the item\'s unit before pricing it', () => {
    expect(convertWeight(2.2046, 'lb', 'kg')).toBe(1);
    expect(convertWeight(16, 'oz', 'lb')).toBe(1);
    expect(convertWeight(1, 'kg', 'oz')).toBe(35.27);
    expect(one({ qty: 4.4092, unit: 'lb', grossCents: 2000 }, 'beef').steps).toEqual([{ kind: 'single', id: 'beef', qty: 2, cents: 1000 }]); // 2 kg for $20.00: $10.00 a kg, not 4.41 kg at $4.54
    expect(one({ qty: 32, unit: 'oz', grossCents: 800 }, 'rice').steps).toEqual([{ kind: 'single', id: 'rice', qty: 2, cents: 400 }]);
    expect(one({ qty: 3, unit: 'lb', grossCents: 900 }, 'rice').steps).toEqual([{ kind: 'single', id: 'rice', qty: 3, cents: 300 }]); // same unit: unchanged
  });
  it('leaves a line sold by count out of a weighed item and says why', () => {
    const p = one({ qty: 2, grossCents: 1000 }, 'rice');
    expect(p.steps).toEqual([]);
    expect(p.notes[0]).toContain('Sold by count on the receipt');
  });
  it('treats a weighed line for an item kept by count as one purchase', () => {
    expect(one({ qty: 2, unit: 'lb', grossCents: 1000 }, 'soap').steps).toEqual([{ kind: 'single', id: 'soap', qty: 1, cents: 1000 }]);
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
      removeGroceryItem: (id, opts) => { calls.push(`remove ${id} ${opts?.quiet ? 'quiet' : 'loud'}`); },
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

describe('proposeItem and tidyName', () => {
  const line = (p: Partial<Receipt['lines'][number]> = {}) => ({ text: 'ZEVIA SODA 12PK', qty: 1, grossCents: 899, discountCents: 0, matchId: null, ...p });
  it('tidies the case and spaces and caps the name at 80 characters', () => {
    expect(tidyName('ZEVIA   SODA 12PK ')).toBe('Zevia soda 12pk');
    expect(tidyName('X'.repeat(120))).toHaveLength(80);
    expect(tidyName('')).toBe('');
  });
  it('fills a plain count line with the receipt store when it is on the list', () => {
    expect(proposeItem(line(), 'BJS WHOLESALE CLUB', ["BJ's", 'Aldi'])).toEqual({ n: 'Zevia soda 12pk', store: "BJ's", qty: '1', price: '8.99', unit: '' });
  });
  it('uses the picked store, or Anywhere, when the receipt store is not on the list', () => {
    expect(proposeItem(line(), 'SAMS CLUB', ["BJ's"], 'Aldi').store).toBe('Aldi');
    expect(proposeItem(line(), 'SAMS CLUB', ["BJ's"]).store).toBe('');
  });
  it('counts a discount and divides by the count for the price per unit', () => {
    expect(proposeItem(line({ qty: 2, grossCents: 2000, discountCents: 400 }), undefined, []).price).toBe('8.00');
  });
  it('gives a weighed line its weight and unit, with the price per unit', () => {
    expect(proposeItem(line({ text: 'GRAPES', qty: 2.5, unit: 'lb', grossCents: 1000 }), undefined, [])).toMatchObject({ qty: '2.5', unit: 'lb', price: '4.00' });
  });
  it('copes with odd text and a zero quantity', () => {
    expect(proposeItem(line({ text: '   ', qty: 0 }), undefined, [])).toMatchObject({ n: '', qty: '1' });
  });
});

describe('stageDraft', () => {
  const draft = { n: 'Zevia soda 12pk', store: "BJ's", qty: '1', price: '8.99', unit: '' as const };
  it('stages a good draft with cents and a count', () => {
    expect(stageDraft(draft, items, [], 'new:1')).toEqual({ ok: true, item: { id: 'new:1', n: 'Zevia soda 12pk', store: "BJ's", qty: 1, cents: 899 } });
    expect(stageDraft({ ...draft, price: '', unit: 'lb' }, items, [], 'new:1')).toMatchObject({ ok: true, item: { cents: null, unit: 'lb' } });
  });
  it('says what is wrong in plain words and stages nothing', () => {
    const err = (d: Partial<typeof draft>, staged: Staged[] = [], list = items) => { const r = stageDraft({ ...draft, ...d }, list, staged, 'new:9'); return r.ok ? null : r.error; };
    expect(err({ n: '   ' })).toBe('Give the item a name.');
    expect(err({ qty: 'lots' })).toBe('The count must be a number from 0.01 to 999.');
    expect(err({ qty: '0' })).toBe('The count must be a number from 0.01 to 999.');
    expect(err({ price: '3,49' })).toBe('The price must be dollars, like 3.49.');
    expect(err({ n: 'eggs' })).toContain('already in this store');
    expect(err({ n: 'eggs', store: 'Aldi' })).toBeNull(); // another store is allowed
    expect(err({}, [{ id: 'new:1', n: 'ZEVIA soda 12pk', store: "bj's", qty: 1, cents: null }])).toContain('Pick it in the list');
    expect(err({}, [], Array.from({ length: 500 }, (_, i) => item(`i${i}`, `Item ${i}`)))).toContain('list is full');
  });
});

describe('staged items in the plan', () => {
  const zevia: Staged = { id: 'new:1', n: 'Zevia soda 12pk', store: "BJ's", qty: 1, cents: 899 };
  const withZevia = receipt.lines.map((l, i) => (i === 5 ? { itemId: 'new:1', include: true } : matched[i]!));
  it('plans a staged item like a matched one and counts it', () => {
    const p = planReceipt(receipt, withZevia, items, "BJ's", [zevia]);
    expect(p.steps).toContainEqual({ kind: 'single', id: 'new:1', qty: 1, cents: 899 });
    expect(p.items).toBe(6);
    expect(p.itemsCents).toBe(8668 + 899);
  });
  it('sums two lines for one staged item', () => {
    const r: Receipt = { lines: [{ text: 'ZEVIA A', qty: 1, grossCents: 899, discountCents: 0, matchId: null }, { text: 'ZEVIA B', qty: 1, grossCents: 799, discountCents: 0, matchId: null }] };
    const p = planReceipt(r, [{ itemId: 'new:1', include: true }, { itemId: 'new:1', include: true }], items, null, [zevia]);
    expect(p.steps).toEqual([{ kind: 'prices', id: 'new:1', prices: [899, 799] }]);
  });
  it('drops an unticked staged item, and a weighed staged item takes the weight', () => {
    expect(planReceipt(receipt, withZevia.map((c, i) => (i === 5 ? { ...c, include: false } : c)), items, null, [zevia]).steps.some(s => s.kind !== 'tax' && s.id === 'new:1')).toBe(false);
    const grapes: Staged = { id: 'new:2', n: 'Grapes', store: '', qty: 2.5, cents: 400, unit: 'lb' };
    const r: Receipt = { lines: [{ text: 'GRAPES', qty: 2.5, unit: 'lb', grossCents: 1000, discountCents: 0, matchId: null }] };
    expect(planReceipt(r, [{ itemId: 'new:2', include: true }], items, null, [grapes]).steps).toEqual([{ kind: 'single', id: 'new:2', qty: 2.5, cents: 400 }]);
  });
});

describe('createStaged, remapPlan and Undo of what Apply made', () => {
  const zevia: Staged = { id: 'new:1', n: 'Zevia soda 12pk', store: "BJ's", qty: 1, cents: 899 };
  const unused: Staged = { id: 'new:2', n: 'Never used', store: '', qty: 1, cents: null };
  const r: Receipt = { lines: [{ text: 'ZEVIA', qty: 1, grossCents: 899, discountCents: 0, matchId: null }] };
  const plan = planReceipt(r, [{ itemId: 'new:1', include: true }], items, null, [zevia, unused]);
  const store = (err: string | null = null) => {
    const list: GroceryItem[] = [...items]; const adds: string[] = [];
    return { adds, api: { addGroceryItem: (d: { n: string; store: string; qty: string; price: string; unit?: string }) => { adds.push(`${d.n}|${d.store}|${d.qty}|${d.price}|${d.unit}`); if (err) return err; list.unshift(item('made-1', d.n, { store: d.store })); return null; }, items: () => list } };
  };
  it('creates each used staged item once, and not an unused one', () => {
    const s = store();
    const made = createStaged(plan, [zevia, unused], s.api);
    expect(s.adds).toEqual(["Zevia soda 12pk|BJ's|1|8.99|"]);
    expect(made).toEqual({ ids: { 'new:1': 'made-1' }, created: [zevia], refused: [] });
    expect(remapPlan(plan, made.ids).steps).toEqual([{ kind: 'single', id: 'made-1', qty: 1, cents: 899 }]);
  });
  it('names a refusal, drops that item from the plan and still reports the rest', () => {
    const made = createStaged(plan, [zevia], store('The list is full (500 items).').api);
    expect(made.refused).toEqual(['Zevia soda 12pk (The list is full (500 items).)']);
    expect(remapPlan(plan, made.ids).steps).toEqual([]);
    expect(addedText(made.created, made.refused)).toBe(' Could not add: Zevia soda 12pk (The list is full (500 items).).');
  });
  it('says what was added in the Undo text', () => {
    expect(addedText([zevia, unused], [])).toBe(' Added Zevia soda 12pk to BJ\'s and Never used to Anywhere.');
    expect(addedText([], [])).toBe('');
  });
  it('removes the made item quietly after putting its line back', () => {
    const real = remapPlan(plan, { 'new:1': 'made-1' });
    const snap = takeSnapshot(real, '2026-11', {}, [...items, item('made-1', 'Zevia soda 12pk')], undefined, ['made-1']);
    expect(snap).toEqual({ month: '2026-11', lines: { 'made-1': null }, usual: {}, tax: null, created: ['made-1'] });
    const calls: string[] = [];
    restoreSnapshot(snap, { restoreGroceryLine: (_m: string, id: string, l: GroceryLine | null) => { calls.push(`restore ${id} ${l}`); }, removeGroceryItem: (id: string, o?: { quiet?: boolean }) => { calls.push(`remove ${id} ${o?.quiet}`); } } as unknown as GroceryApi);
    expect(calls).toEqual(['restore made-1 null', 'remove made-1 true']);
  });
});
