import type { GroceryMonth } from '../types.ts';
import { beforeEach, describe, expect, it } from 'vitest';
// The store flags its saves with a one-time listener on `document`, which node does not have: give it a stub before the store loads.
Object.assign(globalThis, { document: { addEventListener() {}, removeEventListener() {} } });
const { useAppStore } = await import('./useAppStore.js');

// carryGroceryTicks (ADR 079): waits for the data, writes Have never Got, marks the month once.
const grocery = { stores: [], items: [{ id: 'rice', n: 'Rice', store: '', qty: 1, cents: 300, every: true, out: false }, { id: 'kale', n: 'Kale', store: '', qty: 1, cents: 300, every: true, out: false }] };
const sep: GroceryMonth = { lines: { rice: { have: true }, kale: { got: true, cents: 310 } }, pulled: [] };
const setReady = (on: boolean) => useAppStore.setState(s => ({ ready: Object.fromEntries(Object.keys(s.ready).map(k => [k, on])) as unknown as typeof s.ready }));

describe('carryGroceryTicks', () => {
  beforeEach(() => { useAppStore.setState({ grocery, groceryMonths: { '2026-09': sep } }); setReady(true); });

  it('does nothing while the data is still loading', () => {
    setReady(false);
    useAppStore.getState().carryGroceryTicks('2026-10');
    expect(useAppStore.getState().groceryMonths['2026-10']).toBeUndefined();
  });

  it('ticks Have (never Got) for what was had, and marks the month', () => {
    useAppStore.getState().carryGroceryTicks('2026-10');
    expect(useAppStore.getState().groceryMonths['2026-10']).toEqual({ lines: { rice: { have: true }, kale: { have: true } }, pulled: [], carried: '2026-09' });
  });

  it('refuses a key that is not a month, and seeds a month only once', () => {
    useAppStore.getState().carryGroceryTicks('October');
    expect(useAppStore.getState().groceryMonths.October).toBeUndefined();
    useAppStore.getState().carryGroceryTicks('2026-10');
    useAppStore.getState().setGroceryHave('2026-10', 'rice', false);
    useAppStore.getState().carryGroceryTicks('2026-10');
    expect(useAppStore.getState().groceryMonths['2026-10']?.lines.rice).toBeUndefined();
  });
});
