import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// The purchase log (brief grocery-purchase-log) through the real store actions: Ran out on At home closes the purchase instead of erasing it,
// buying again is a second purchase, an undo takes back the open one only, and a month saved before the log reads as it did.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
let lib: typeof import('../lib/grocery.js');
let settle: typeof import('../lib/grocerySettle.js');
let hist: typeof import('../lib/itemHistory.js');
const st = () => useAppStore.getState();
let MILK = '';
const mk = () => lib.monthKey(new Date());
const line = () => st().groceryMonths[mk()]?.lines[MILK];
const month = () => st().groceryMonths[mk()]!;
const item = () => st().grocery.items.find(i => i.id === MILK)!;
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); lib = await import('../lib/grocery.js'); settle = await import('../lib/grocerySettle.js'); hist = await import('../lib/itemHistory.js'); await st().init(); });
beforeEach(() => {
  clearStorage();
  useAppStore.setState({ grocery: lib.normGrocery(null), groceryMonths: {} });
  st().addGroceryStore('Aldi');
  st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price: '5', every: true });
  MILK = st().grocery.items.find(i => i.n === 'Milk')!.id;
});
const spent = () => lib.tally([item()], month()).spent;

describe('Ran out closes the purchase', () => {
  it('keeps the purchase in the month and puts the item back on To get unticked', () => {
    st().setGroceryGot(mk(), MILK, true);
    expect(line()).toMatchObject({ got: true });
    expect(line()!.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(st().setGroceryHave(mk(), MILK, false)).toBe(true);
    expect(line()!.got).toBeUndefined();
    expect(line()!.buys).toHaveLength(1);
    expect(line()!.buys![0]).toMatchObject({ qty: 1, cents: 500, store: 'Aldi' });
    expect(lib.lineOf(item(), month()).got).toBe(false);
    expect(spent()).toBe(500); // Spending still counts it
    expect(lib.spendByMonth(st().grocery, st().groceryMonths, mk(), 1)[0]!.spent).toBe(500);
    expect(settle.purchasesOf(st().grocery, month()).map(p => p.cents)).toEqual([500]);
  });
  it('buying it again is a second purchase and the month totals both', () => {
    st().setGroceryGot(mk(), MILK, true);
    st().setGroceryHave(mk(), MILK, false);
    st().setGroceryGot(mk(), MILK, true);
    st().setGroceryCents(mk(), MILK, 650);
    expect(line()!.buys).toHaveLength(1);
    expect(spent()).toBe(500 + 650);
    expect(settle.purchasesOf(st().grocery, month()).map(p => p.cents).sort()).toEqual([500, 650]);
    const h = hist.itemHistory(item(), st().groceryMonths);
    expect(h.purchases.map(p => p.each)).toEqual([650, 500]); // newest first, both stamped
    expect(h.purchases.every(p => !!p.at)).toBe(true);
  });
  it('an undo on To get takes back the open purchase only, never a closed one', () => {
    st().setGroceryGot(mk(), MILK, true);
    st().setGroceryHave(mk(), MILK, false);
    st().setGroceryGot(mk(), MILK, true);
    st().setGroceryGot(mk(), MILK, false);
    expect(line()!.got).toBeUndefined();
    expect(line()!.at).toBeUndefined();
    expect(line()!.buys).toHaveLength(1);
    expect(spent()).toBe(500);
  });
  it('a later price or store change does not reach a closed purchase', () => {
    st().setGroceryGot(mk(), MILK, true);
    st().setGroceryHave(mk(), MILK, false);
    st().updateGroceryItem(MILK, { cents: 900 });
    st().addGroceryStore('BJs');
    st().updateGroceryItem(MILK, { store: 'BJs' });
    expect(spent()).toBe(500);
    expect(settle.purchasesOf(st().grocery, month())[0]).toMatchObject({ cents: 500, store: 'Aldi' });
  });
  it('a pack-priced purchase closes with its packs', () => {
    st().setGroceryGot(mk(), MILK, true);
    st().setGroceryPrices(mk(), MILK, [300, 350]);
    st().setGroceryHave(mk(), MILK, false);
    expect(line()!.buys![0]).toMatchObject({ prices: [300, 350] });
    expect(spent()).toBe(650);
    expect(settle.purchasesOf(st().grocery, month()).map(p => p.cents)).toEqual([300, 350]);
  });
  it('an unpriced purchase closes unpriced, so a price given later does not price it', () => {
    st().updateGroceryItem(MILK, { cents: null });
    st().setGroceryGot(mk(), MILK, true);
    st().setGroceryHave(mk(), MILK, false);
    st().updateGroceryItem(MILK, { cents: 400 });
    expect(line()!.buys![0]).toMatchObject({ unpriced: true });
    expect(spent()).toBe(0);
  });
  it('ticking Have only (not bought) and unticking leaves no purchase', () => {
    st().setGroceryHave(mk(), MILK, true);
    st().setGroceryHave(mk(), MILK, false);
    expect(line()).toBeUndefined();
  });
  it('refuses at 20 closed purchases and changes nothing', () => {
    for (let i = 0; i < 20; i++) { st().setGroceryGot(mk(), MILK, true); expect(st().setGroceryHave(mk(), MILK, false)).toBe(true); }
    st().setGroceryGot(mk(), MILK, true);
    expect(st().setGroceryHave(mk(), MILK, false)).toBe(false);
    expect(line()!.got).toBe(true);
    expect(line()!.buys).toHaveLength(20);
  });
  it('a receipt date stamps the purchase', () => {
    st().setGroceryGot(mk(), MILK, true, '2026-11-03');
    expect(line()!.at).toBe('2026-11-03');
  });
});

describe('a month saved before the log', () => {
  it('reads the same: no stamp, same totals, nothing rewritten by reading', () => {
    useAppStore.setState({ groceryMonths: { [mk()]: { lines: { [MILK]: { got: true, qty: 2, cents: 300 } }, pulled: [] } } });
    expect(spent()).toBe(600);
    expect(line()!.at).toBeUndefined();
    expect(hist.itemHistory(item(), st().groceryMonths).purchases).toHaveLength(1);
    expect(hist.itemHistory(item(), st().groceryMonths).purchases[0]!.at).toBeUndefined();
    expect(line()).toEqual({ got: true, qty: 2, cents: 300 });
  });
  it('keeps the stamp and closed purchases through the shared cleaner and drops what is not valid', () => {
    const buy = { at: '2026-11-03T14:20', qty: 1, cents: 500, store: 'Aldi', share: { with: ['p1'] } };
    const m = lib.normGroceryMonth({ lines: { a: { got: true, at: '2026-11-04T09:05', buys: [buy] }, b: { at: '2026-11-04T09:05', buys: [{ at: 'yesterday', cents: 1.5 }, 'x', { qty: 2, cents: 100 }] }, c: { got: true, buys: Array.from({ length: 30 }, () => ({ qty: 1, cents: 1 })) } }, pulled: [] });
    expect(m.lines.a).toMatchObject({ got: true, at: '2026-11-04T09:05' });
    expect(m.lines.a!.buys![0]).toMatchObject({ at: '2026-11-03T14:20', qty: 1, cents: 500, store: 'Aldi' });
    expect(m.lines.b!.at).toBeUndefined(); // a stamp only goes with a bought line
    expect(m.lines.b!.buys).toEqual([{ qty: 2, cents: 100 }]);
    expect(m.lines.c!.buys).toHaveLength(20);
    expect(lib.normGroceryMonth(JSON.parse(JSON.stringify(m)))).toEqual(m); // a save and load changes nothing
  });
});
