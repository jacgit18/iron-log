import { describe, expect, it } from 'vitest';
import { usualStart } from './foodUnit.js';
import { undoUsual, undoUsualOutcome, usualAfterStep, usualChange, withUsual } from './usualPortion.js';

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

describe('undoUsualOutcome', () => {
  const change = { previous: 3, next: 1.5 };
  it('writes the previous usual back while the stored one is still what the step wrote', () => {
    expect(undoUsualOutcome({ usual: 1.5 }, change)).toEqual({ kind: 'write', usual: 3 });
    expect(undoUsualOutcome({ usual: 1.5 }, { previous: undefined, next: 1.5 })).toEqual({ kind: 'write', usual: undefined });
  });
  it('leaves it alone when it was changed since', () => expect(undoUsualOutcome({ usual: 2 }, change)).toEqual({ kind: 'changed' }));
  it('says the food is gone when the recipe was removed', () => expect(undoUsualOutcome(undefined, change)).toEqual({ kind: 'gone' }));
});

describe('usualAfterStep (Less or More on an eaten row)', () => {
  const TODAY = '2026-11-15';
  it('a food logged today from a recipe saves the stepped amount as its usual', () => {
    expect(usualAfterStep(TODAY, TODAY, rice, 1.5)).toEqual({ previous: undefined, next: 1.5 });
  });
  it('an earlier day leaves the usual alone', () => {
    expect(usualAfterStep('2026-11-14', TODAY, rice, 1.5)).toBeNull();
  });
  it('a food with no recipe behind it saves no usual', () => {
    expect(usualAfterStep(TODAY, TODAY, undefined, 1.5)).toBeNull();
  });
  it('a step back to where the usual already is changes nothing', () => {
    expect(usualAfterStep(TODAY, TODAY, { ...rice, usual: 1.5 }, 1.5)).toBeNull();
  });
  it('stepping back to 1 clears a usual', () => {
    expect(usualAfterStep(TODAY, TODAY, { ...rice, usual: 1.5 }, 1)).toEqual({ previous: 1.5, next: undefined });
  });
});
