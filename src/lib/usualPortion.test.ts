import { describe, expect, it } from 'vitest';
import { usualStart } from './foodUnit.js';
import { undoUsual, usualChange, withUsual } from './usualPortion.js';

const rice = { cat: 'ready' as const, servings: 4, kcal: 200, p: 4 };

describe('usualChange', () => {
  it('a food never changed, logged at a new portion, gets that portion as its usual', () => {
    expect(usualChange(rice, 2)).toEqual({ previous: undefined, next: 2 });
  });
  it('logging at the portion the sheet opened at changes nothing (no write, no Undo)', () => {
    expect(usualChange(rice, 1)).toBeNull();
    expect(usualChange({ ...rice, usual: 3 }, 3)).toBeNull();
  });
  it('a new portion replaces the old usual and remembers it', () => {
    expect(usualChange({ ...rice, usual: 3 }, 1.5)).toEqual({ previous: 3, next: 1.5 });
  });
  it('logging 1 clears a usual, because the field never holds 1', () => {
    expect(usualChange({ ...rice, usual: 3 }, 1)).toEqual({ previous: 3, next: undefined });
  });
  it('compares with where the sheet opened, which is capped at what one entry holds', () => {
    const big = { ...rice, usual: 99 };
    const top = usualStart(big);
    expect(top).toBeLessThan(99);
    expect(usualChange(big, top)).toBeNull();
  });
  it('an amount the field cannot hold leaves the old usual alone', () => {
    expect(usualChange({ ...rice, usual: 3 }, 0.25)).toBeNull();
    expect(usualChange(rice, 120)).toBeNull();
  });
});

describe('undoUsual', () => {
  const change = { previous: 3, next: 2 };
  it('puts the previous usual back while the stored number is still the one this change wrote', () => {
    expect(undoUsual(2, change)).toEqual({ usual: 3 });
  });
  it('restores "none" when there was no usual before', () => {
    expect(undoUsual(2, { previous: undefined, next: 2 })).toEqual({ usual: undefined });
  });
  it('does nothing when another change was saved since', () => {
    expect(undoUsual(4, change)).toBeNull();
    expect(undoUsual(undefined, change)).toBeNull();
  });
  it('undoing a clear brings the old usual back', () => {
    expect(undoUsual(undefined, { previous: 3, next: undefined })).toEqual({ usual: 3 });
  });
});

describe('withUsual', () => {
  it('sets, replaces and removes the field without touching the input', () => {
    const r: { n: string; usual?: number } = { n: 'Rice', usual: 3 };
    expect(withUsual(r, 2)).toEqual({ n: 'Rice', usual: 2 });
    expect(withUsual(r, undefined)).toEqual({ n: 'Rice' });
    const plain: { n: string; usual?: number } = { n: 'Rice' };
    expect('usual' in withUsual(plain, undefined)).toBe(false);
    expect(r).toEqual({ n: 'Rice', usual: 3 });
  });
});
