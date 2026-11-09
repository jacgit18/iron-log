import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Brief supplement-portions: a product in two sections shares one set of nutrient rows and one serving size; the portion and the section stay each one's own.
let useAppStore: any; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normSupplements } = await import('../lib/water.js');
  useAppStore.setState({ supp: normSupplements(null), modal: null });
});

const rows = (mg: number) => [{ key: 'magnesium', amount: mg, unit: 'mg' }];
const twoSections = () => {
  expect(st().saveSupplement({ n: 'Magnesium', slot: 'morning', nutrients: rows(200), serving: { units: 2, form: 'capsule' } })).toBeNull();
  const am = st().supp.items[0];
  expect(st().addSupplementInstance(am.id, 'night')).toBe(true);
  return [st().supp.items[0].id, st().supp.items[1].id];
};

describe('supplement portions in the store', () => {
  it('saves a portion on one section and leaves the other at one serving', () => {
    const [a, b] = twoSections();
    expect(st().saveSupplement({ id: a, n: 'Magnesium', slot: 'morning', portion: 1 })).toBeNull();
    expect(st().saveSupplement({ id: b, n: 'Magnesium', slot: 'night', portion: 0.5 })).toBeNull();
    const [x, y] = st().supp.items;
    expect(x.portion).toBeUndefined();
    expect(y.portion).toBe(0.5);
  });
  it('an edit that sends no portion keeps the saved one, and 1 clears it', () => {
    const [, b] = twoSections();
    st().saveSupplement({ id: b, n: 'Magnesium', slot: 'night', portion: 2 });
    st().saveSupplement({ id: b, n: 'Magnesium', slot: 'night', dose: '2 caps' });
    expect(st().supp.items[1].portion).toBe(2);
    st().saveSupplement({ id: b, n: 'Magnesium', slot: 'night', portion: 1 });
    expect('portion' in st().supp.items[1]).toBe(false);
  });
  it('a copy added to another section starts at one serving', () => {
    expect(st().saveSupplement({ n: 'Zinc', slot: 'morning', portion: 2 })).toBeNull();
    expect(st().addSupplementInstance(st().supp.items[0].id, 'night')).toBe(true);
    expect(st().supp.items[0].portion).toBe(2);
    expect('portion' in st().supp.items[1]).toBe(false);
  });
  it('changing the nutrient rows or the serving size in one section changes the other, not the portion or the section', () => {
    const [a, b] = twoSections();
    st().saveSupplement({ id: b, n: 'Magnesium', slot: 'night', portion: 0.5 });
    st().saveSupplement({ id: a, n: 'Magnesium', slot: 'morning', nutrients: rows(300), serving: { units: 3, form: 'tablet' } });
    const [x, y] = st().supp.items;
    expect(x).toMatchObject({ slot: 'morning', nutrients: rows(300), serving: { units: 3, form: 'tablet' } });
    expect(y).toMatchObject({ slot: 'night', nutrients: rows(300), serving: { units: 3, form: 'tablet' }, portion: 0.5 });
    expect(y.nutrients).not.toBe(x.nutrients); // a copy, so a later edit of one never mutates the other
  });
  it('clearing the rows or the serving size clears them in every section', () => {
    const [a] = twoSections();
    st().saveSupplement({ id: a, n: 'Magnesium', slot: 'morning', nutrients: [], serving: null });
    for (const i of st().supp.items) { expect('nutrients' in i).toBe(false); expect('serving' in i).toBe(false); }
  });
  it('a save that sends no rows or serving leaves the other section alone', () => {
    const [a] = twoSections();
    st().saveSupplement({ id: a, n: 'Magnesium', slot: 'morning', dose: '1 g' });
    expect(st().supp.items[1]).toMatchObject({ nutrients: rows(200), serving: { units: 2, form: 'capsule' } });
  });
  it('only the same product is shared: another supplement or the same name from another brand is left alone', () => {
    st().saveSupplement({ n: 'Zinc', slot: 'morning', nutrients: [{ key: 'zinc', amount: 15, unit: 'mg' }] });
    const [a] = twoSections();
    st().saveSupplement({ id: a, n: 'Magnesium', slot: 'morning', nutrients: rows(400) });
    expect(st().supp.items.find((i: any) => i.n === 'Zinc').nutrients).toEqual([{ key: 'zinc', amount: 15, unit: 'mg' }]);
  });
  it('a clean serving size is kept and a bad one is dropped', () => {
    expect(st().saveSupplement({ n: 'Zinc', slot: 'morning', serving: { units: 0 } })).toBeNull();
    expect('serving' in st().supp.items[0]).toBe(false);
  });
});
