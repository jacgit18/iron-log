import { describe, expect, it } from 'vitest';
import { groupOfStore, knownPeople, monthShare, payerOf, purchasesOf, storeSettlement, storesBought } from './grocerySettle.js';
import { ME } from './grocerySplit.js';
import type { Grocery, GroceryMonth } from '../types.ts';

const it_ = (id: string, store: string, cents: number, extra: object = {}) => ({ id, n: id, store, qty: 1, cents, every: true, out: false, ...extra });
const g: Grocery = {
  stores: ["BJ's", 'Aldi'],
  items: [it_('tp', "BJ's", 2499), it_('towels', "BJ's", 2199), it_('chicken', "BJ's", 0), it_('rice', 'Aldi', 500)],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom', covered: true }], stores: ["BJ's"] }],
};
const bought: GroceryMonth = {
  lines: {
    tp: { got: true }, towels: { got: true },
    chicken: { got: true, prices: [1049, 925, 899], packShares: [{ with: [] }, { with: [] }, null] }, // two packs are mine, the third is for everyone
    rice: { got: true },
  },
  pulled: [],
};

describe('purchasesOf', () => {
  it('uses the store group by default, a pack\'s own share over the line\'s, and splits packs one by one', () => {
    const p = purchasesOf(g, bought).filter(x => x.store === "BJ's");
    expect(p.map(x => [x.itemId, x.cents, x.parties])).toEqual([
      ['tp', 2499, [ME, 'sis', 'mom']], ['towels', 2199, [ME, 'sis', 'mom']],
      ['chicken', 1049, [ME]], ['chicken', 925, [ME]], ['chicken', 899, [ME, 'sis', 'mom']],
    ]);
  });
  it('a store with no group is just you', () => expect(purchasesOf(g, bought).find(x => x.itemId === 'rice')!.parties).toEqual([ME]));
  it('an item\'s usual share beats the store group, and a line\'s beats the item\'s', () => {
    const g2: Grocery = { ...g, items: [it_('tp', "BJ's", 2499, { share: { with: ['sis'] } })] };
    expect(purchasesOf(g2, { lines: { tp: { got: true } }, pulled: [] })[0]!.parties).toEqual([ME, 'sis']);
    expect(purchasesOf(g2, { lines: { tp: { got: true, share: { with: [] } } }, pulled: [] })[0]!.parties).toEqual([ME]);
  });
  it('leaves out what was not bought, and counts a removed item as yours alone', () => {
    const m: GroceryMonth = { lines: { tp: { qty: 2 }, gone: { got: true, qty: 2, cents: 300 } }, pulled: [] };
    expect(purchasesOf(g, m)).toEqual([{ store: '', itemId: 'gone', cents: 600, parties: [ME] }]);
  });
  it('drops a person who was removed from every split', () => {
    const g2: Grocery = { ...g, groups: [{ ...g.groups![0]!, people: [{ id: 'sis', n: 'Sister' }] }] };
    expect(purchasesOf(g2, { lines: { tp: { got: true, share: { with: ['sis', 'mom'] } } }, pulled: [] })[0]!.parties).toEqual([ME, 'sis']);
  });
});

describe('who paid', () => {
  it('is you unless a person who still exists is recorded', () => {
    expect(payerOf(g, bought, "BJ's")).toBe(ME);
    expect(payerOf(g, { ...bought, payer: { "BJ's": 'mom' } }, "BJ's")).toBe('mom');
    expect(payerOf(g, { ...bought, payer: { "BJ's": 'removed-person' } }, "BJ's")).toBe(ME);
  });
  it('helpers find the group and the people', () => {
    expect(groupOfStore(g, "BJ's")?.id).toBe('g1');
    expect(groupOfStore(g, 'Aldi')).toBeUndefined();
    expect([...knownPeople(g)]).toEqual(['sis', 'mom']);
  });
});

describe('the BJ\'s settle-up', () => {
  it('asks the sister, not the mom whose share is covered, and the shares add up to the bill', () => {
    const s = storeSettlement(g, bought, "BJ's");
    expect(s.bill).toBe(2499 + 2199 + 1049 + 925 + 899);
    expect(s.rows.find(r => r.id === 'sis')!.kind).toBe('owesYou');
    expect(s.rows.find(r => r.id === 'mom')!.kind).toBe('covered');
    expect(s.yourShare + s.rows.reduce((a, r) => a + r.cents, 0)).toBe(s.bill);
    expect(s.owedToYou).toBe(s.rows.find(r => r.id === 'sis')!.cents);
  });
  it('when the mom paid, you owe her your share', () => {
    const s = storeSettlement(g, { ...bought, payer: { "BJ's": 'mom' } }, "BJ's");
    expect(s.youOwe).toBe(s.yourShare);
    expect(s.rows[0]).toMatchObject({ id: 'mom', kind: 'youOwe' });
  });
  it('when the payer was removed it is you again and nothing fails', () => {
    const s = storeSettlement(g, { ...bought, payer: { "BJ's": 'removed-person' } }, "BJ's");
    expect(s.youOwe).toBe(0);
  });
});

describe('the month', () => {
  it('lists the stores bought from in order, no-store last', () => {
    expect(storesBought(g, purchasesOf(g, bought))).toEqual(["BJ's", 'Aldi']);
    expect(storesBought(g, purchasesOf(g, { lines: { gone: { got: true, qty: 1, cents: 1 } }, pulled: [] }))).toEqual(['']);
  });
  it('your share is less than what was paid when something is shared, and equal when nothing is', () => {
    const { paid, yours } = monthShare(g, bought);
    expect(paid).toBe(2499 + 2199 + 1049 + 925 + 899 + 500);
    expect(yours).toBeLessThan(paid);
    expect(yours).toBeGreaterThan(500 + 1049 + 925); // the rice and two chicken packs, plus a third of the rest
    const plain: Grocery = { stores: ['Aldi'], items: [it_('rice', 'Aldi', 500)] };
    expect(monthShare(plain, { lines: { rice: { got: true } }, pulled: [] })).toEqual({ paid: 500, yours: 500 });
  });
});
