import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

// Brief supplement-split-times: the sheet's time chips become adds, amount changes and removes of the product's entries.
let useAppStore: any; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normSupplements } = await import('../lib/water.js');
  useAppStore.setState({ supp: normSupplements(null), modal: null });
});

const fish = () => { expect(st().saveSupplement({ n: 'Fish oil', slot: 'morning', dose: '1 g', serving: { units: 1, form: 'softgel' }, portion: 2 })).toBeNull(); return st().supp.items[0].id as string; };
const slots = () => st().supp.items.map((i: any) => `${i.slot}:${i.portion ?? 1}`);

describe('saveSupplementTimes', () => {
  it('splits two softgels in the morning into one in Morning and one in Night, each its own entry', () => {
    const id = fish();
    expect(st().saveSupplementTimes(id, [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }], '1 g')).toBe(true);
    expect(slots()).toEqual(['morning:1', 'night:1']);
    const [a, b] = st().supp.items;
    expect(a.id).not.toBe(b.id);
    expect(b).toMatchObject({ n: 'Fish oil', dose: '1 g', serving: { units: 1, form: 'softgel' } });
  });
  it('keeps the ticks of an entry whose time stays on', () => {
    const id = fish(); st().setSupplementTaken('2026-11-10', id, true);
    st().saveSupplementTimes(id, [{ slot: 'morning', portion: 2 }, { slot: 'noon', portion: 1 }], '1 g');
    expect(st().supp.taken['2026-11-10'][id]).toBe(true);
    expect(slots()).toEqual(['morning:2', 'noon:1']);
  });
  it('writes one dose to every time, and clears it when empty', () => {
    const id = fish(); st().saveSupplementTimes(id, [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }], '2 g');
    expect(st().supp.items.map((i: any) => i.dose)).toEqual(['2 g', '2 g']);
    st().saveSupplementTimes(id, [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }], '');
    expect(st().supp.items.every((i: any) => !('dose' in i))).toBe(true);
  });
  it('removes the entry of a time turned off, with an Undo notice, and keeps the other', () => {
    const id = fish(); st().saveSupplementTimes(id, [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }], '1 g');
    st().saveSupplementTimes(id, [{ slot: 'night', portion: 1 }], '1 g');
    expect(slots()).toEqual(['night:1']);
    expect(st().removed).toMatchObject({ scope: 'suppslot:morning', text: 'Fish oil from Morning' });
    st().removed.restore();
    expect(slots()).toEqual(['morning:1', 'night:1']);
  });
  it('moves a library-only supplement into the first chosen time', () => {
    expect(st().saveSupplement({ n: 'Zinc', slot: '' })).toBeNull();
    const id = st().supp.items[0].id;
    st().saveSupplementTimes(id, [{ slot: 'noon', portion: 1 }, { slot: 'night', portion: 1 }], '');
    expect(slots()).toEqual(['noon:1', 'night:1']);
    expect(st().supp.items[0].id).toBe(id);
  });
  it('refuses no times', () => { const id = fish(); expect(st().saveSupplementTimes(id, [], '')).toBe(false); expect(slots()).toEqual(['morning:2']); });
  it('a rename on the sheet reaches every time, so Save does not add a second copy at the other time', () => {
    const id = fish(); st().saveSupplementTimes(id, [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }], '1 g');
    expect(st().saveSupplement({ id, n: 'Fish oil 1000', slot: 'morning', dose: '1 g' })).toBeNull();
    expect(st().saveSupplementTimes(id, [{ slot: 'morning', portion: 1 }, { slot: 'night', portion: 1 }], '1 g')).toBe(true);
    expect(st().supp.items.map((i: any) => `${i.n}@${i.slot}`)).toEqual(['Fish oil 1000@morning', 'Fish oil 1000@night']);
  });
});
