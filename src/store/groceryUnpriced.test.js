import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Code audit M-01: an item bought with no price stays unpriced in that month; a price the item gets later must not reach back and price it.
let useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {} });
});

const setup = async (price = '') => {
  const lib = await import('../lib/grocery.js');
  st().addGroceryItem({ n: 'Milk', store: 'Aldi', qty: '1', price, every: true });
  const id = st().grocery.items[0].id; const mk = lib.monthKey(new Date()); const last = lib.shiftMonth(mk, -1);
  const spent = (key) => lib.spendByMonth(st().grocery, st().groceryMonths, mk, 2).find(r => r.key === key).spent;
  return { lib, id, mk, last, spent };
};

describe('a purchase with no price', () => {
  it('stays $0.00 last month when the item is priced this month (the usual price too)', async () => {
    const { lib, id, mk, last, spent } = await setup();
    st().setGroceryGot(last, id, true);
    expect(st().groceryMonths[last].lines[id].unpriced).toBe(true);
    st().setGroceryCents(mk, id, 500);
    expect(st().grocery.items[0].cents).toBe(500);
    expect(spent(last)).toBe(0);
    const m = st().groceryMonths[last];
    expect(lib.lineOf(st().grocery.items[0], m).cents).toBeNull();
    expect(lib.tally(lib.inMonth(st().grocery, st().grocery.items, m), m).spent).toBe(0);
  });
  it('also stays unpriced when the price is edited on At home (the item itself)', async () => {
    const { id, last, spent } = await setup();
    st().setGroceryGot(last, id, true);
    expect(st().updateGroceryItem(id, { cents: 700 })).toBeNull();
    expect(spent(last)).toBe(0);
  });
  it('takes the price typed on that very month, and the mark goes', async () => {
    const { id, last, spent } = await setup();
    st().setGroceryGot(last, id, true);
    st().setGroceryCents(last, id, 450);
    expect(st().groceryMonths[last].lines[id].unpriced).toBeUndefined();
    expect(spent(last)).toBe(450);
  });
  it('goes when it is unticked, and a later tick takes the price the item has by then', async () => {
    const { id, last, spent } = await setup();
    st().setGroceryGot(last, id, true);
    st().setGroceryGot(last, id, false);
    expect(st().groceryMonths[last]?.lines[id]?.unpriced).toBeUndefined();
    st().updateGroceryItem(id, { cents: 300 });
    st().setGroceryGot(last, id, true);
    expect(st().groceryMonths[last].lines[id].unpriced).toBeUndefined();
    expect(spent(last)).toBe(300);
  });
  it('is not marked when the item had a price at the tick, and that price is kept', async () => {
    const { id, last, spent } = await setup('4.00');
    st().setGroceryGot(last, id, true);
    expect(st().groceryMonths[last].lines[id].unpriced).toBeUndefined();
    st().updateGroceryItem(id, { cents: 900 });
    expect(spent(last)).toBe(400);
  });
  it('is marked again when a bought line has its price cleared, one price or a list', async () => {
    const { id, last, spent } = await setup('4.00');
    st().setGroceryGot(last, id, true);
    st().setGroceryCents(last, id, null);
    expect(st().groceryMonths[last].lines[id].unpriced).toBe(true);
    st().setGroceryPrices(last, id, [100, 200]);
    expect(st().groceryMonths[last].lines[id].unpriced).toBeUndefined();
    expect(spent(last)).toBe(300);
    st().setGroceryPrices(last, id, null);
    expect(st().groceryMonths[last].lines[id].unpriced).toBe(true);
    expect(spent(last)).toBe(0);
  });
});

describe('the mark in saved data and sync', () => {
  it('is kept only on a bought line with no price of its own', async () => {
    const { normGroceryMonth } = await import('../shared/grocery.js');
    const m = normGroceryMonth({ lines: {
      a: { got: true, unpriced: true },
      b: { unpriced: true },
      c: { got: true, cents: 300, unpriced: true },
      d: { got: true, prices: [100, 200], unpriced: true },
      e: { got: true, unpriced: 'yes' },
    }, pulled: [] });
    expect(m.lines.a).toEqual({ got: true, unpriced: true });
    expect(m.lines.b).toBeUndefined();
    expect(m.lines.c).toEqual({ got: true, cents: 300 });
    expect(m.lines.d).toEqual({ got: true, prices: [100, 200] });
    expect(m.lines.e).toEqual({ got: true });
  });
  it('merges field by field: a tick elsewhere does not lose it, and a price typed elsewhere wins', async () => {
    const { mergeGroceryMonth3 } = await import('../sync/merge.js');
    const base = { lines: { a: { got: true, unpriced: true } }, pulled: [] };
    const ours = { lines: { a: { got: true, unpriced: true }, b: { got: true } }, pulled: [] };
    const theirs = { lines: { a: { got: true, cents: 250 } }, pulled: [] };
    const line = mergeGroceryMonth3(base, ours, theirs).week.lines;
    expect(line.a.cents).toBe(250);
    expect(line.a.unpriced).toBeUndefined();
    expect(line.b).toEqual({ got: true });
  });
});

describe('the unpriced mark, loose ends (overnight audit G-1 and G-4)', () => {
  it('typing a count on a bought line priced pack by pack keeps what it was bought at: the item’s price as it is then, so a later price change does not reach back', async () => {
    const { lib, id, last, spent } = await setup('5.00');
    st().setGroceryGot(last, id, true);
    st().setGroceryPrices(last, id, [899, 1049]); // priced pack by pack: $19.48
    expect(spent(last)).toBe(1948);
    st().setGroceryQty(last, id, 3); // back to one price for all: the item's $5.00
    expect(spent(last)).toBe(1500);
    expect(st().groceryMonths[last].lines[id]).toMatchObject({ got: true, qty: 3, cents: 500 });
    st().updateGroceryItem(id, { cents: 1000 });
    expect(spent(last)).toBe(1500); // not $30.00
    expect(lib.lineOf(st().grocery.items[0], st().groceryMonths[last]).cents).toBe(500);
  });
  it('a count on a bought line of an item with no price stays unpriced', async () => {
    const { id, last, spent } = await setup();
    st().setGroceryGot(last, id, true);
    st().setGroceryQty(last, id, 2);
    expect(st().groceryMonths[last].lines[id].unpriced).toBe(true);
    st().updateGroceryItem(id, { cents: 700 });
    expect(spent(last)).toBe(0);
  });
  it('a count on a line not bought leaves it alone', async () => {
    const { id, mk } = await setup('5.00');
    st().setGroceryQty(mk, id, 2);
    expect(st().groceryMonths[mk].lines[id]).toEqual({ qty: 2 });
  });
  it('unticking on At home drops the mark with the purchase, so the item reads at its price again', async () => {
    const { lib, id, last } = await setup();
    st().setGroceryGot(last, id, true);
    expect(st().groceryMonths[last].lines[id].unpriced).toBe(true);
    st().setGroceryHave(last, id, false);
    st().updateGroceryItem(id, { cents: 500 });
    expect(st().groceryMonths[last]?.lines[id]?.unpriced).toBeUndefined();
    expect(lib.lineOf(st().grocery.items[0], st().groceryMonths[last] ?? lib.emptyMonth()).cents).toBe(500);
  });
});
