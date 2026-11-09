import { describe, expect, it } from 'vitest';
import { BUILTIN } from '../lib/data.js';
import { buildDataFile, parseDataFile } from '../lib/export.js';
import { normItems } from '../lib/supplements.js';
import { normSupplements } from '../lib/water.js';
import { normSupplementItem } from './listItems.js';

const base = { id: 'multi', n: 'Multi', slot: 'morning' };
const full = { ...base, serving: { units: 2, form: 'Capsule' }, nutrients: [{ key: 'vitaminD', amount: 25, unit: 'mcg' }, { key: 'zinc', amount: 11, unit: 'mg' }] };

describe('supplement item: serving and nutrients', () => {
  it('keeps a clean serving and nutrient list', () => {
    expect(normSupplementItem(full)).toEqual(full);
  });
  it('leaves an item without them exactly as before', () => {
    expect(normSupplementItem(base)).toEqual(base);
    expect(normSupplementItem({ ...base, nutrients: [], serving: {} })).toEqual(base);
  });
  it('drops unknown nutrients, units, bad amounts and repeats, and caps the list', () => {
    const it = normSupplementItem({ ...base, nutrients: [
      { key: 'zinc', amount: 11, unit: 'mg' }, { key: 'zinc', amount: 99, unit: 'mg' }, { key: 'zinc', amount: 5000, unit: 'mcg' },
      { key: 'lead', amount: 1, unit: 'mg' }, { key: 'iron', amount: 1, unit: 'oz' }, { key: 'iron', amount: -1, unit: 'mg' },
      { key: 'iron', amount: 0, unit: 'mg' }, { key: 'iron', amount: '5', unit: 'mg' }, { key: 'iron', amount: Infinity, unit: 'mg' }, null, 'x'] });
    expect(it?.nutrients).toEqual([{ key: 'zinc', amount: 11, unit: 'mg' }, { key: 'zinc', amount: 5000, unit: 'mcg' }]);
  });
  it('rejects a serving with no positive number of units and trims the form', () => {
    expect(normSupplementItem({ ...base, serving: { units: 0 } })?.serving).toBeUndefined();
    expect(normSupplementItem({ ...base, serving: { units: '2' } })?.serving).toBeUndefined();
    expect(normSupplementItem({ ...base, serving: { units: 1.5, form: '  Powder ' } })?.serving).toEqual({ units: 1.5, form: 'Powder' });
  });
  it('keeps them through the supplements document normaliser', () => {
    expect(normItems({ items: [full] })).toEqual([full]);
    expect(normSupplements({ items: [full] }).items).toEqual([full]);
  });
});

describe('backup export and restore', () => {
  it('carries serving and nutrients through a data file', () => {
    const plain = { ...base, id: 'plain' };
    const snap: any = { cfg: {}, logs: {}, programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], body: [], stretches: [], supp: { waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, items: [full, plain], taken: {} } };
    const text = JSON.stringify(buildDataFile(snap, {}));
    expect(JSON.parse(text).supplements.items[0]).toEqual(full);
    expect(parseDataFile(text).supplements?.items).toEqual([full, plain]);
  });
});
