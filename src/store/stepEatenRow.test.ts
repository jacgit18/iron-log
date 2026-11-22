import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import type { DietEntry } from '../types.ts';

// Less and More on an eaten row (brief nutrition-log-first-portion-row): the store calls and the usual's Undo. The rules are node tests in src/lib (eatenStep, usualPortion); this covers the paths that touch the store.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
let stepEatenRow: typeof import('../components/nutritionBoard/stepEatenRow.js').stepEatenRow;
const st = () => useAppStore.getState();
const TODAY = '2026-11-15';
const recipe = { id: 'o1', n: 'Oats', cat: 'other' as const, ing: [{ n: 'x' }], steps: ['Cook.'], kcal: 300, p: 10 };
const entry: DietEntry = { id: 'e1', d: TODAY, n: 'Oats', kcal: 300, p: 10, from: 'o1', x: 1 };
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); ({ stepEatenRow } = await import('../components/nutritionBoard/stepEatenRow.js')); await st().init(); });
beforeEach(() => { clearStorage(); useAppStore.setState({ recipes: [recipe], diet: [entry] }); });
type Said = { t: string; undo?: () => void; action?: { label: string; run: () => void } };
const run = (to: number, e = entry) => { const said: Said[] = []; stepEatenRow(e, to, st().recipes[0], TODAY, (t, undo, action) => said.push({ t, ...(undo ? { undo } : {}), ...(action ? { action } : {}) })); return said; };
/** The nudge, then the person presses the offered button: everything said, in order. */
const nudgeAndSave = (to: number): Said[] => { const said: Said[] = []; const say = (t: string, undo?: () => void, action?: { label: string; run: () => void }) => said.push({ t, ...(undo ? { undo } : {}), ...(action ? { action } : {}) }); stepEatenRow(entry, to, st().recipes[0], TODAY, say); said[0]!.action!.run.call(null); return said; };

describe('stepEatenRow', () => {
  it('steps the entry, saves no usual, and offers to save it', () => {
    const said = run(1.5);
    expect(st().diet[0]).toMatchObject({ x: 1.5, kcal: 450 });
    expect(st().recipes[0]!.usual).toBeUndefined(); // the nudge changed this entry only
    expect(said[0]!.t).toBe('Oats, 1.5 portions.');
    expect(said[0]!.action!.label).toBe('Save 1.5 portions as my usual');
    expect(said[0]!.undo).toBeUndefined();
  });
  it('the offered button saves the usual and says so with an Undo', () => {
    const said = nudgeAndSave(1.5);
    expect(st().recipes[0]!.usual).toBe(1.5);
    expect(said[1]!.t).toBe('Usual portion saved: Oats, 1.5 portions.');
    expect(said[1]!.undo).toBeTypeOf('function');
  });
  it('Undo puts the previous usual back and keeps the entry as it is', () => {
    nudgeAndSave(1.5)[1]!.undo!();
    expect(st().recipes[0]!.usual).toBeUndefined();
    expect(st().diet[0]!.x).toBe(1.5);
  });
  // The status line presses the offered button, then its Undo: a `say` that does both, after `between` changed the world.
  const pressSaveThenUndo = (between: () => void): string[] => {
    const seen: string[] = [];
    const say = (t: string, undo?: () => void, action?: { label: string; run: () => void }) => { seen.push(t); if (action) action.run(); else if (undo) { between(); undo(); } };
    stepEatenRow(entry, 1.5, st().recipes[0], TODAY, say);
    return seen;
  };
  it('Undo leaves the usual alone, and says so, when it was changed since', () => {
    const seen = pressSaveThenUndo(() => { st().setRecipeUsual('o1', 3); });
    expect(st().recipes[0]!.usual).toBe(3);
    expect(seen.at(-1)).toBe('The usual portion was changed since, so it was left as it is.');
  });
  it('Undo says so when the recipe was removed meanwhile', () => {
    const seen = pressSaveThenUndo(() => { useAppStore.setState({ recipes: [] }); });
    expect(seen.at(-1)).toBe('This food was removed, so there is no usual to restore.');
  });
  it('a nudge back to the usual start clears the earlier offer, so a stale Save cannot be pressed', () => {
    const said: Said[] = [];
    const say = (t: string, undo?: () => void, action?: { label: string; run: () => void }) => said.push({ t, ...(undo ? { undo } : {}), ...(action ? { action } : {}) });
    stepEatenRow(entry, 1.5, st().recipes[0], TODAY, say); // More: offers Save 1.5
    stepEatenRow({ ...entry, x: 1.5 }, 1, st().recipes[0], TODAY, say); // Less back to 1, the opening portion: nothing to offer
    expect(said[0]!.action).toBeDefined();
    expect(said[1]).toEqual({ t: '' }); // the status line is told an empty sentence and no button
    expect(st().recipes[0]!.usual).toBeUndefined();
  });
  it('an earlier day steps the entry and offers nothing', () => {
    const old = { ...entry, d: '2026-11-14' };
    useAppStore.setState({ diet: [old] });
    expect(run(1.5, old)).toEqual([{ t: '' }]);
    expect(st().recipes[0]!.usual).toBeUndefined();
  });
  it('says the store\'s words and changes nothing when the count is out of range', () => {
    const said = run(0.25);
    expect(said[0]!.t).toBe('That portion is out of range.');
    expect(said[0]!.action).toBeUndefined();
    expect(st().diet[0]!.x).toBe(1);
  });
});
