import { describe, it, expect } from 'vitest';
import type { LibraryItem, ProgramSlot } from '../types.ts';
import { DEFAULT_CFG } from './logic.js';
import { carryPhDef, defaultDestination, isLibKey, moveSlotId, movePreview, moveTargets, programByKey, slotSummary, splitPhDef, splitSuperset } from './programMove.js';

const cfg = { ...structuredClone(DEFAULT_CFG), progNames: { B: 'Upper' } };
const lib = [{ id: 'q1', name: 'Mine', at: 'x', prog: { key: 'N', days: [] } }] as unknown as LibraryItem[];
const card = (over: Partial<ProgramSlot> = {}): ProgramSlot => ({ id: 'A-d1s1', sec: 'Regular', items: [{ ex: 'arnold', ph: 'strength' }], ...over }) as ProgramSlot;
const [A, B, MINE] = moveTargets(cfg, lib);

describe('moveTargets', () => {
  it('lists A and B first, named as the program is, then the saved programs', () => {
    expect(moveTargets(cfg, lib)).toEqual([
      { key: 'A', label: 'Program A', onBoard: true },
      { key: 'B', label: 'Upper', onBoard: true },
      { key: 'L:q1', label: 'Mine', onBoard: false },
    ]);
  });
  it('lists only A and B when nothing is saved', () => { expect(moveTargets(cfg, []).map(t => t.key)).toEqual(['A', 'B']); });
  it('knows a library key', () => { expect(isLibKey('L:q1')).toBe(true); expect(isLibKey('A')).toBe(false); });
});

describe('programByKey', () => {
  const progs = { A: { key: 'A', days: [] }, B: undefined } as never;
  it('finds A, a saved program, and null for one that is gone', () => {
    expect(programByKey(progs, lib, 'A')?.key).toBe('A');
    expect(programByKey(progs, lib, 'L:q1')?.key).toBe('N');
    expect(programByKey(progs, lib, 'L:gone')).toBeNull();
    expect(programByKey(progs, lib, 'B')).toBeNull();
  });
});

describe('defaultDestination', () => {
  it('opens on the same program and the next day, Day 7 wrapping to Day 1', () => {
    expect(defaultDestination('A', 1)).toEqual({ key: 'A', day: 2 });
    expect(defaultDestination('L:q1', 6)).toEqual({ key: 'L:q1', day: 7 });
    expect(defaultDestination('B', 7)).toEqual({ key: 'B', day: 1 });
  });
});

describe('movePreview', () => {
  const base = { slot: card(), fromKey: 'A', fromDay: 1, targetSlots: [] as ProgramSlot[] };
  it('says where the card lands', () => {
    expect(movePreview({ ...base, to: B!, toDay: 3 })).toEqual({
      line: 'Lands at the end of Regular on Upper · Day 3.', same: false, notes: ['Keeps its sets and phase; this week’s ticks stay behind.'],
    });
  });
  it('names the day alone for a card with no section', () => {
    expect(movePreview({ ...base, slot: card({ sec: undefined }), to: A!, toDay: 4 }).line).toBe('Lands at the end of Program A · Day 4.');
  });
  it('says it is already there for the same program and day, with no notes', () => {
    expect(movePreview({ ...base, to: A!, toDay: 1 })).toEqual({ line: 'It is already there.', same: true, notes: [] });
  });
  it('a move inside one program makes no claim about ticks', () => {
    expect(movePreview({ ...base, to: A!, toDay: 2 }).notes).toEqual([]);
  });
  it('warns that a saved program is not on the board', () => {
    expect(movePreview({ ...base, to: MINE!, toDay: 2 }).notes).toContain('Not on your board until you load it.');
  });
  it('warns when the same exercise is already on that day, and still allows it', () => {
    const p = movePreview({ ...base, to: B!, toDay: 2, targetSlots: [card({ id: 'B-d2s1' })] });
    expect(p.notes).toContain('Already on this day.');
    expect(p.same).toBe(false);
  });
});

describe('moveSlotId', () => {
  it('prefixes the target program, N for a saved program, like a card added in the editor', () => {
    expect(moveSlotId('B', 'k1')).toBe('B-xk1');
    expect(moveSlotId('L:q1', 'k1')).toBe('N-xk1');
  });
});

describe('carryPhDef', () => {
  it('writes the old id’s phase defaults under the new id, leaving out items without one', () => {
    const ph = { 'A-d1s1:0': 'hyp', 'A-d1s1:2': 'iso', 'A-d1s2:0': 'strength' } as const;
    expect(carryPhDef({ ...ph }, 'A-d1s1', 'B-xk1', 3)).toEqual({ 'B-xk1:0': 'hyp', 'B-xk1:2': 'iso' });
  });
  it('returns nothing when the card has none', () => { expect(carryPhDef({}, 'A-d1s1', 'B-xk1', 2)).toEqual({}); });
});

describe('slotSummary', () => {
  it('names a single card by its exercise and joins a superset or an either/or card', () => {
    const c = structuredClone(DEFAULT_CFG);
    const one = slotSummary(c, card());
    const two = { ...card(), items: [{ ex: 'arnold', ph: 'strength' }, { ex: 'arnold', ph: 'hyp' }] } as ProgramSlot;
    expect(slotSummary(c, { ...two, type: 'superset' })).toBe(`${one} → ${one}`);
    expect(slotSummary(c, { ...two, type: 'either' })).toBe(`${one} or ${one}`);
  });
});

describe('splitSuperset', () => {
  const ss = (n = 2): ProgramSlot => ({ id: 'A-d1s4', sec: 'Supersets', tier: 'T1', type: 'superset', items: Array.from({ length: n }, (_, i) => ({ ex: `ex${i}`, ph: 'strength' })) }) as ProgramSlot;
  it('takes one exercise out as a plain card with the new id; the other becomes a plain card too', () => {
    const r = splitSuperset(ss(), 0, 'A-xnew')!;
    expect(r.moved).toEqual({ id: 'A-xnew', sec: 'Regular', tier: 'T1', items: [{ ex: 'ex0', ph: 'strength' }] });
    expect(r.rest).toEqual({ id: 'A-d1s4', sec: 'Regular', tier: 'T1', items: [{ ex: 'ex1', ph: 'strength' }] });
  });
  it('keeps a superset of three as a superset of two', () => {
    const r = splitSuperset(ss(3), 1, 'n')!;
    expect(r.rest.type).toBe('superset'); expect(r.rest.sec).toBe('Supersets');
    expect(r.rest.items.map(i => i.ex)).toEqual(['ex0', 'ex2']);
  });
  it('refuses a plain card, an either/or card and a position that is not there', () => {
    expect(splitSuperset(card(), 0, 'n')).toBeNull();
    expect(splitSuperset({ ...ss(), type: 'either' }, 0, 'n')).toBeNull();
    expect(splitSuperset(ss(), 5, 'n')).toBeNull();
  });
  it('does not change the card it was given', () => {
    const o = ss(); splitSuperset(o, 0, 'n'); expect(o).toEqual(ss());
  });
});

describe('splitPhDef', () => {
  it('moves the leaving exercise\'s default to the new id and shifts the later ones up', () => {
    const r = splitPhDef({ 'A-d1s4:0': 'iso', 'A-d1s4:1': 'hyp', 'A-d1s4:2': 'strength', 'other:0': 'iso' }, 'A-d1s4', 3, 0, 'new');
    expect(r.set).toEqual({ 'new:0': 'iso', 'A-d1s4:0': 'hyp', 'A-d1s4:1': 'strength' });
    expect(r.del).toEqual(['A-d1s4:0', 'A-d1s4:1', 'A-d1s4:2']);
    expect(r.before).toEqual({ 'A-d1s4:0': 'iso', 'A-d1s4:1': 'hyp', 'A-d1s4:2': 'strength' });
  });
  it('leaves out exercises with no saved default', () => {
    expect(splitPhDef({ 'c:1': 'iso' }, 'c', 2, 1, 'n').set).toEqual({ 'n:0': 'iso' });
  });
});
