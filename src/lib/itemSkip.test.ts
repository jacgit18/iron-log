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
  it('is a touch on the card', () => {
    const w = week(); setItemSkipped(w, ss, 0, true);
    expect(touched(ss, w)).toBe(true);
  });
});

describe('one option of an either/or skipped on its own', () => {
  it('leaves the card open so the other option can still be ticked', () => {
    const w = week(); setItemSkipped(w, either, 0, true);
    expect(isItemSkipped(either, 0, w)).toBe(true); expect(isSkipped(either, w)).toBe(false);
    expect(unitsOf(either, w)).toBe(1); expect(isDone(either, w)).toBe(false);
    setItemDone(w, either, 1, true);
    expect(isDone(either, w)).toBe(true); expect(isItemDone(either, 1, w)).toBe(true); expect(isItemDone(either, 0, w)).toBe(false);
  });
  it('skips the card once every option is skipped, and ticking an option brings it back', () => {
    const w = week(); setItemSkipped(w, either, 0, true); setItemSkipped(w, either, 1, true);
    expect(isSkipped(either, w)).toBe(true);
    setItemDone(w, either, 0, true);
    expect(isSkipped(either, w)).toBe(false); expect(isItemSkipped(either, 0, w)).toBe(false); expect(isDone(either, w)).toBe(true);
  });
  it('skipping the picked option puts the pick back', () => {
    const w = week(); setItemDone(w, either, 0, true);
    setItemSkipped(w, either, 0, true);
    expect(isDone(either, w)).toBe(false);
  });
});
