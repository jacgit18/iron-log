import { describe, expect, it } from 'vitest';
import { BUILTIN } from '../lib/data.js';
import { buildDataFile, parseDataFile } from '../lib/export.js';
import { normItems } from '../lib/supplements.js';
import { normSupplementItem } from './listItems.js';

const base = { id: 'mag', n: 'Magnesium', slot: 'night', serving: { units: 2, form: 'Capsule' }, nutrients: [{ key: 'magnesium', amount: 200, unit: 'mg' }] };

describe('supplement item: portion', () => {
  it('keeps a portion above 0 up to 10 and rounds it to four decimals', () => {
    expect(normSupplementItem({ ...base, portion: 0.5 })?.portion).toBe(0.5);
    expect(normSupplementItem({ ...base, portion: 10 })?.portion).toBe(10);
    expect(normSupplementItem({ ...base, portion: 1 / 3 })?.portion).toBe(0.3333);
  });
  it('stores one serving as no portion, and drops anything unusable', () => {
    expect('portion' in normSupplementItem({ ...base, portion: 1 })!).toBe(false);
    for (const bad of [0, -2, 11, NaN, '2', null]) expect('portion' in normSupplementItem({ ...base, portion: bad })!).toBe(false);
    expect(normSupplementItem(base)).toEqual(base); // an old item is unchanged
  });
  it('survives the supplements normaliser and a backup export and restore', () => {
    const half = { ...base, id: 'mag-2', portion: 0.5 };
    expect(normItems({ items: [half] })).toEqual([half]);
    const snap: any = { cfg: {}, logs: {}, programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], body: [], stretches: [], supp: { waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, items: [half, base], taken: {} } };
    const text = JSON.stringify(buildDataFile(snap, {}));
    expect(parseDataFile(text).supplements?.items).toEqual([half, base]);
  });
});
