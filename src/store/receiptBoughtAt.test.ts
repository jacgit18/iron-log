import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import type { Receipt } from '../shared/receipt.js';
import type { Choice } from '../lib/groceryReceipt.js';

// Receipt bought-at store (brief receipt-bought-at) through the real store actions: Apply marks items bought at the receipt's store, the usual-store option changes At home,
// and Undo puts both back, including an item that was already ticked before the receipt (the usual store must go back before the line, or the line is pinned to the wrong store).
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
let lib: typeof import('../lib/grocery.js');
let plan: typeof import('../lib/groceryReceipt.js');
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); lib = await import('../lib/grocery.js'); plan = await import('../lib/groceryReceipt.js'); await st().init(); });
beforeEach(async () => {
  clearStorage();
  useAppStore.setState({ grocery: lib.normGrocery(null), groceryMonths: {} });
  st().addGroceryStore("BJ's"); st().addGroceryStore('Aldi');
  st().addGroceryItem({ n: 'Eggs', store: 'Aldi', qty: '1', price: '5', every: true });
  st().addGroceryItem({ n: 'Rice', store: '', qty: '1', price: '7', every: true });
  EGGS = st().grocery.items.find(i => i.n === 'Eggs')!.id;
});
const idOf = (n: string) => st().grocery.items.find(i => i.n === n)!.id;
let EGGS = '';
const eggsId = () => EGGS; // the Aldi eggs, found before any other Eggs is added at BJ's
const receipt = (): Receipt => ({ store: "BJ's", lines: [{ text: 'EGGS', qty: 1, grossCents: 500, discountCents: 0, matchId: eggsId() }, { text: 'RICE', qty: 1, grossCents: 700, discountCents: 0, matchId: idOf('Rice') }] });
const choices = (): Choice[] => receipt().lines.map(l => ({ itemId: l.matchId ?? null, include: true }));
const run = (mk: string, makeUsual: boolean) => {
  const s = st(); const month = s.groceryMonths[mk];
  const p = plan.planReceipt(receipt(), choices(), s.grocery.items, null, [], { at: "BJ's", makeUsual, g: s.grocery, lines: month?.lines ?? {} });
  const snap = plan.takeSnapshot(p, mk, month?.lines ?? {}, s.grocery.items, month?.tax);
  const out = { refused: [] as string[] };
  plan.applyPlan(p, mk, st(), out);
  return { p, snap, out };
};

describe('Apply and Undo on the real store', () => {
  it('marks the items bought at the receipt store for the month only, and Undo clears it', () => {
    const mk = lib.monthKey(new Date());
    const { snap } = run(mk, false);
    const lines = st().groceryMonths[mk]!.lines;
    expect(lines[eggsId()]).toMatchObject({ got: true, store: "BJ's" });
    expect(lines[idOf('Rice')]).toMatchObject({ got: true, store: "BJ's" });
    expect(st().grocery.items.find(i => i.n === 'Eggs')!.store).toBe('Aldi'); // At home is unchanged
    plan.restoreSnapshot(snap, st());
    expect(st().groceryMonths[mk]?.lines[eggsId()]).toBeUndefined();
    expect(st().grocery.items.find(i => i.n === 'Eggs')!.store).toBe('Aldi');
  });
  it('with the usual-store option the items move on At home, and Undo moves them back', () => {
    const mk = lib.monthKey(new Date());
    const { snap } = run(mk, true);
    expect(st().grocery.items.find(i => i.n === 'Eggs')!.store).toBe("BJ's");
    expect(st().grocery.items.find(i => i.n === 'Rice')!.store).toBe("BJ's");
    expect(st().groceryMonths[mk]!.lines[eggsId()].store).toBeUndefined(); // it is the usual store now
    plan.restoreSnapshot(snap, st());
    expect(st().grocery.items.find(i => i.n === 'Eggs')!.store).toBe('Aldi');
    expect(st().grocery.items.find(i => i.n === 'Rice')!.store).toBe('');
  });
  it('Undo of an item that was already ticked before the receipt leaves it counted at its old store', () => {
    const mk = lib.monthKey(new Date());
    st().setGroceryGot(mk, eggsId(), true); // bought earlier this month at Aldi, its usual store
    const { snap } = run(mk, true);
    plan.restoreSnapshot(snap, st());
    const line = st().groceryMonths[mk]!.lines[eggsId()];
    expect(line.got).toBe(true);
    expect(line.store === undefined || line.store === 'Aldi').toBe(true); // never pinned to BJ's
    expect(st().grocery.items.find(i => i.n === 'Eggs')!.store).toBe('Aldi');
  });
  it('a name already at the receipt store is refused as usual, and the line stays bought there', () => {
    const mk = lib.monthKey(new Date());
    st().addGroceryItem({ n: 'Eggs', store: "BJ's", qty: '1', price: '', every: true });
    const { out } = run(mk, true);
    expect(st().grocery.items.find(i => i.n === 'Eggs' && i.store !== "BJ's")!.store).toBe('Aldi');
    expect(out.refused).toHaveLength(1);
    expect(st().groceryMonths[mk]!.lines[eggsId()]).toBeDefined();
  });
});
