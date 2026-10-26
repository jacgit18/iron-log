import { describe, it, expect } from 'vitest';
import type { LibraryItem, ProgramSlot } from '../types.ts';
import { DEFAULT_CFG } from './logic.js';
import { carryPhDef, defaultDestination, isLibKey, moveSlotId, movePreview, moveTargets } from './programMove.js';

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
