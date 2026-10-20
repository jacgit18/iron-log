import { describe, expect, it } from 'vitest';
import { allPeople, groupOfStore, hasSharing, knownPeople, monthOwed, monthOwes, monthShare, partiesFor, payerOf, purchasesOf, shareByMonth, shareText, storeSettlement, storesBought } from './grocerySettle.js';
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

describe('what a picker shows', () => {
  it('words a split', () => {
    expect(shareText([ME])).toBe('Just me');
    expect(shareText([ME, 'sis'])).toBe('Me +1');
    expect(shareText([ME, 'sis', 'mom'])).toBe('Me +2');
    expect(shareText(['sis', 'mom'])).toBe('Not mine');
  });
  it('finds who shares an item, a line or a pack, most specific first', () => {
    const tp = g.items.find(x => x.id === 'tp')!;
    expect(partiesFor(g, tp)).toEqual([ME, 'sis', 'mom']); // the store's group
    expect(partiesFor(g, { ...tp, share: { with: ['sis'] } })).toEqual([ME, 'sis']);
    expect(partiesFor(g, tp, { share: { with: [] } })).toEqual([ME]);
    expect(partiesFor(g, tp, { share: { with: [] }, prices: [1, 2], packShares: [null, { with: ['mom'] }] }, 1)).toEqual([ME, 'mom']);
    expect(partiesFor(g, tp, { share: { with: [] }, prices: [1, 2], packShares: [null, { with: ['mom'] }] }, 0)).toEqual([ME]);
  });
  it('knows whether sharing is set up', () => {
    expect(hasSharing(g)).toBe(true);
    expect(hasSharing({ stores: [], items: [] })).toBe(false);
  });
  it('gives paid and your share for each month, oldest first', () => {
    const r = shareByMonth(g, { '2026-10': bought }, '2026-10', 2);
    expect(r.map(x => x.key)).toEqual(['2026-09', '2026-10']);
    expect(r[0]).toEqual({ key: '2026-09', paid: 0, yours: 0 });
    expect(r[1]!.paid).toBeGreaterThan(r[1]!.yours);
  });
});

describe('what you paid', () => {
  it('counts only the bills of stores where you are the payer, while your share still counts everything', () => {
    const all = monthShare(g, bought);
    const momPaidBJs = monthShare(g, { ...bought, payer: { "BJ's": 'mom' } });
    expect(momPaidBJs.paid).toBe(500); // only the Aldi rice
    expect(momPaidBJs.yours).toBe(all.yours);
    expect(monthShare(g, { ...bought, payer: { "BJ's": 'mom', Aldi: 'sis' } }).paid).toBe(0);
  });
  it('the Spending series follows the same rule', () => {
    expect(shareByMonth(g, { '2026-10': { ...bought, payer: { "BJ's": 'mom' } } }, '2026-10', 1)[0]!.paid).toBe(500);
  });
});

describe('what is owed to you', () => {
  it('adds up what the others owe over the stores you paid for, and is nothing when someone else paid or nothing is shared', () => {
    const purchases = purchasesOf(g, bought);
    const sum = storesBought(g, purchases).reduce((a, st) => a + storeSettlement(g, bought, st, purchases).owedToYou, 0);
    expect(sum).toBeGreaterThan(0);
    expect(monthOwed(g, bought)).toBe(sum);
    expect(monthOwed(g, { ...bought, payer: { "BJ's": 'mom', Aldi: 'mom' } })).toBe(0);
    expect(monthOwed({ stores: g.stores, items: g.items }, bought)).toBe(0);
  });
});

describe('tax at a store', () => {
  it('goes on that store\'s bill once, and every share still adds up to the bill', () => {
    const base = storeSettlement(g, bought, "BJ's");
    const taxed = storeSettlement({ ...g, taxes: { "BJ's": 8875 } }, bought, "BJ's");
    const tax = Math.round((base.bill * 8875) / 100_000);
    expect(taxed.tax).toBe(tax);
    expect(taxed.bill).toBe(base.bill + tax);
    const covered = taxed.rows.filter(r => r.kind === 'covered').reduce((a, r) => a + r.cents, 0);
    expect(taxed.yourShare + taxed.owedToYou + covered).toBe(taxed.bill); // you paid: you, those who owe you, and the one already paid
    expect(storeSettlement({ ...g, taxes: { "BJ's": 8875 } }, bought, 'Aldi').tax).toBe(0); // another store: none
  });
  it('is in what you paid and your share for the month', () => {
    const plain = monthShare(g, bought);
    const taxed = monthShare({ ...g, taxes: { "BJ's": 8875, Aldi: 8875 } }, bought);
    expect(taxed.paid).toBeGreaterThan(plain.paid);
    expect(taxed.yours).toBeGreaterThan(plain.yours);
  });
});

describe('what changes hands', () => {
  it('splits what others owe you from what you owe them by who paid each store', () => {
    const mine = monthOwes(g, bought);
    expect(mine.owed).toBe(monthOwed(g, bought));
    expect(mine.youOwe).toBe(0); // you paid every store
    const theirs = monthOwes(g, { ...bought, payer: { "BJ's": 'mom', Aldi: 'mom' } });
    expect(theirs.owed).toBe(0);
    expect(theirs.youOwe).toBeGreaterThan(0);
    const mixed = monthOwes(g, { ...bought, payer: { "BJ's": 'mom' } });
    expect(mixed.youOwe).toBeGreaterThan(0); // BJ's: you owe mom your share
  });
});

describe('allPeople', () => {
  it('lists each person once across groups', () => {
    const g2: Grocery = { ...g, groups: [...g.groups!, { id: 'g2', n: 'Home', people: [{ id: 'sis', n: 'Sister' }, { id: 'pat', n: 'Pat' }], stores: [] }] };
    expect(allPeople(g2).map(p => p.id)).toEqual(['sis', 'mom', 'pat']);
    expect(allPeople({ stores: [], items: [] })).toEqual([]);
  });
});
