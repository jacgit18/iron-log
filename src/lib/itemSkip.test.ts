import { describe, expect, it } from 'vitest';
import { isDone, isItemDone, isItemSkipped, isSkipped, itemKey2, setItemDone, setItemSkipped, tally, unitsOf, doneUnitsOf, touched } from './logic.js';
import type { Week } from '../types.ts';

const ss = { id: 'ss', type: 'superset' as const, items: [{ ex: 'a' }, { ex: 'b' }] };
const either = { id: 'ei', type: 'either' as const, items: [{ ex: 'a' }, { ex: 'b' }] };
const week = (): Week => ({ prog: null, done: {}, skipped: {}, moved: {}, ph: {}, warm: {} } as Week);

describe('one exercise of a superset skipped on its own', () => {
  it('skips just that exercise and leaves the card open', () => {
    const w = week(); setItemSkipped(w, ss, 1, true);
    expect(w.skipped[itemKey2(ss, 1)]).toBe(true);
    expect(isItemSkipped(ss, 1, w)).toBe(true); expect(isItemSkipped(ss, 0, w)).toBe(false);
    expect(isSkipped(ss, w)).toBe(false);
  });
  it('the card counts only the exercises still on, and is done when those are ticked', () => {
    const w = week(); setItemSkipped(w, ss, 1, true);
    expect(unitsOf(ss, w)).toBe(1); expect(tally([ss], w)).toMatchObject({ total: 1, done: 0, full: false });
    setItemDone(w, ss, 0, true);
    expect(isDone(ss, w)).toBe(true); expect(doneUnitsOf(ss, w)).toBe(1); expect(tally([ss], w)).toMatchObject({ total: 1, done: 1, full: true });
    expect(isItemDone(ss, 1, w)).toBe(false); // the skipped one never reads as ticked
  });
  it('skipping a ticked exercise unticks it and keeps the other ticks; ticking a skipped exercise brings it back', () => {
    const w = week(); setItemDone(w, ss, 0, true); setItemDone(w, ss, 1, true);
    expect(w.done.ss).toBe(true); // ticked whole
    setItemSkipped(w, ss, 1, true);
    expect(isItemDone(ss, 0, w)).toBe(true); expect(isItemDone(ss, 1, w)).toBe(false);
    setItemDone(w, ss, 1, true);
    expect(isItemSkipped(ss, 1, w)).toBe(false); expect(isDone(ss, w)).toBe(true);
  });
  it('every exercise skipped means the card is skipped, and putting one back opens the card again', () => {
    const w = week(); setItemSkipped(w, ss, 0, true); setItemSkipped(w, ss, 1, true);
    expect(isSkipped(ss, w)).toBe(true); expect(tally([ss], w)).toMatchObject({ skipped: 1 });
    setItemSkipped(w, ss, 0, false);
    expect(isSkipped(ss, w)).toBe(false);
  });
  it('is a touch on the card, and either/or options cannot be skipped one by one', () => {
    const w = week(); setItemSkipped(w, ss, 0, true);
    expect(touched(ss, w)).toBe(true);
    setItemSkipped(w, either, 0, true);
    expect(w.skipped[itemKey2(either, 0)]).toBeUndefined();
  });
});
