import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Brief supplement-active-ingredients: saving ingredient rows from the sheet and setting or clearing your own limit.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normSupplements } = await import('../lib/water.js');
  useAppStore.setState({ supp: normSupplements(null) });
  st().mutateCfg(c => { delete c.ingredientLimits; });
});

describe('setIngredientLimit', () => {
  it('sets a limit by lowercase name, changes it and removes it', () => {
    expect(st().setIngredientLimit('Caffeine ', { kind: 'cap', amount: '400', unit: 'mg' })).toBeNull();
    expect(st().cfg.ingredientLimits).toEqual({ caffeine: { kind: 'cap', amount: 400, unit: 'mg' } });
    expect(st().setIngredientLimit('caffeine', { kind: 'target', amount: 100, unit: 'mg' })).toBeNull();
    expect(st().cfg.ingredientLimits).toEqual({ caffeine: { kind: 'target', amount: 100, unit: 'mg' } });
    expect(st().setIngredientLimit('CAFFEINE', null)).toBeNull();
    expect('ingredientLimits' in st().cfg).toBe(false);
  });
  it('refuses zero, a negative amount and a missing name, and changes nothing', () => {
    expect(st().setIngredientLimit('Creatine', { kind: 'cap', amount: 0, unit: 'g' })).toMatch(/above zero/);
    expect(st().setIngredientLimit('Creatine', { kind: 'cap', amount: '-3', unit: 'g' })).toMatch(/above zero/);
    expect(st().setIngredientLimit('Creatine', { kind: 'cap', amount: 1e9, unit: 'g' })).toMatch(/too large/);
    expect(st().setIngredientLimit('  ', { kind: 'cap', amount: 1, unit: 'g' })).toMatch(/Name/);
    expect(st().cfg.ingredientLimits).toBeUndefined();
  });
  it('keeps the limit when the last supplement row for it is removed', () => {
    st().saveSupplement({ n: 'Fish oil', slot: 'morning', ingredients: [{ name: 'EPA', amount: 175, unit: 'mg' }] });
    st().setIngredientLimit('EPA', { kind: 'target', amount: 500, unit: 'mg' });
    const id = st().supp.items[0].id;
    st().saveSupplement({ id, n: 'Fish oil', slot: 'morning', ingredients: [] });
    expect(st().supp.items[0].ingredients).toBeUndefined();
    expect(st().cfg.ingredientLimits?.epa).toBeDefined();
  });
});

describe('saveSupplement with ingredients', () => {
  it('saves cleaned rows, keeps them when a caller sends none, and shares them across the product\'s times', () => {
    st().saveSupplement({ n: 'Fish oil', slot: 'morning', ingredients: [{ name: ' omega-3', amount: 475, unit: 'mg' }, { name: 'X', amount: 0, unit: 'mg' }] });
    const id = st().supp.items[0].id;
    expect(st().supp.items[0].ingredients).toEqual([{ name: 'Omega-3', amount: 475, unit: 'mg' }]);
    st().addSupplementInstance(id, 'night');
    expect(st().supp.items[1].ingredients).toEqual([{ name: 'Omega-3', amount: 475, unit: 'mg' }]);
    st().saveSupplement({ id, n: 'Fish oil', slot: 'morning', dose: '2 softgels' });
    expect(st().supp.items[0].ingredients).toHaveLength(1);
    st().saveSupplement({ id, n: 'Fish oil', slot: 'morning', ingredients: [{ name: 'DHA', amount: 150, unit: 'mg' }] });
    expect(st().supp.items.map(i => i.ingredients)).toEqual([[{ name: 'DHA', amount: 150, unit: 'mg' }], [{ name: 'DHA', amount: 150, unit: 'mg' }]]);
  });
});
