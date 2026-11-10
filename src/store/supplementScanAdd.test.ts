import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';
import { planFill } from '../lib/supplementLabelFill.js';
import { supplementNutrientTotals } from '../lib/supplementNutrients.js';
import { cleanSupplementScan } from '../shared/supplementScan.js';

// brief supplement-label-scan: addSupplement takes the rows, serving and brand read from a bottle, so a custom supplement is created with its amounts in one add.
let useAppStore: typeof import('./useAppStore.js').useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normSupplements } = await import('../lib/water.js');
  useAppStore.setState({ supp: normSupplements(null), modal: null });
});

describe('addSupplement with a scanned label', () => {
  const scan = cleanSupplementScan({ name: 'D3', brand: 'Sunny  Co', serving: { text: '2 softgels', units: 2, form: 'Softgel' }, rows: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'zinc', amount: 15, unit: 'mg' }] });
  if (scan.kind !== 'ok') throw new Error('fixture');
  const fill = planFill({}, scan.label).result;

  it('saves the rows, the serving and the brand on the new supplement and syncs them', () => {
    expect(st().addSupplement('morning', 'D3 drops', '', { nutrients: fill.nutrients, ...(fill.serving ? { serving: fill.serving } : {}), brand: scan.label.brand })).toBe(true);
    const x = st().supp.items[0];
    expect(x).toMatchObject({ n: 'D3 drops', slot: 'morning', brand: 'Sunny Co', serving: { units: 2, form: 'Softgel' }, nutrients: [{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'zinc', amount: 15, unit: 'mg' }] });
    expect((saved('supplements/main') as { items: unknown[] }).items[0]).toMatchObject({ brand: 'Sunny Co', nutrients: [{ key: 'vitaminD' }, { key: 'zinc' }] });
  });
  it('reaches Totals: a ticked supplement with a 50 mcg vitamin D row adds 50 mcg', () => {
    st().addSupplement('morning', 'D3 drops', '', { nutrients: fill.nutrients });
    const x = st().supp.items[0];
    const d = supplementNutrientTotals(st().supp.items, { '2026-11-10': { [x.id]: true } }, '2026-11-10').find(t => t.key === 'vitaminD');
    expect(d).toMatchObject({ total: 50, unit: 'mcg' });
  });
  it('cleans what it is given like typed rows, and with no options adds exactly as before', () => {
    st().addSupplement('morning', 'Odd', '', { nutrients: [{ key: 'zinc', amount: -3, unit: 'mg' }, { key: 'iron', amount: 5, unit: 'mg' }], brand: '   ' });
    expect(st().supp.items[0].nutrients).toEqual([{ key: 'iron', amount: 5, unit: 'mg' }]);
    expect(st().supp.items[0].brand).toBeUndefined();
    st().addSupplement('night', 'Plain');
    expect(st().supp.items[1]).not.toHaveProperty('nutrients');
    expect(st().supp.items[1]).not.toHaveProperty('serving');
  });
});
