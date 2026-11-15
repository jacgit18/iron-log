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
const run = (to: number, e = entry) => { const said: { t: string; undo?: () => void }[] = []; stepEatenRow(e, to, st().recipes[0], TODAY, (t, undo) => said.push({ t, ...(undo ? { undo } : {}) })); return said; };

describe('stepEatenRow', () => {
  it('steps the entry, saves the usual and says so with an Undo', () => {
    const said = run(1.5);
    expect(st().diet[0]).toMatchObject({ x: 1.5, kcal: 450 });
    expect(st().recipes[0]!.usual).toBe(1.5);
    expect(said[0]!.t).toBe('Usual portion saved: Oats, 1.5 portions.');
  });
  it('Undo puts the previous usual back and keeps the entry as it is', () => {
    run(1.5)[0]!.undo!();
    expect(st().recipes[0]!.usual).toBeUndefined();
    expect(st().diet[0]!.x).toBe(1.5);
  });
  it('Undo leaves the usual alone, and says so, when it was changed since', () => {
    const seen: string[] = [];
    stepEatenRow(entry, 1.5, st().recipes[0], TODAY, (t, undo) => { seen.push(t); if (undo) { st().setRecipeUsual('o1', 3); undo(); } });
    expect(st().recipes[0]!.usual).toBe(3);
    expect(seen.at(-1)).toBe('The usual portion was changed since, so it was left as it is.');
  });
  it('Undo says so when the recipe was removed meanwhile', () => {
    const seen: string[] = [];
    stepEatenRow(entry, 1.5, st().recipes[0], TODAY, (t, undo) => { seen.push(t); if (undo) { useAppStore.setState({ recipes: [] }); undo(); } });
    expect(seen.at(-1)).toBe('This food was removed, so there is no usual to restore.');
  });
  it('an earlier day steps the entry and saves no usual', () => {
    const old = { ...entry, d: '2026-11-14' };
    useAppStore.setState({ diet: [old] });
    expect(run(1.5, old)).toEqual([]);
    expect(st().recipes[0]!.usual).toBeUndefined();
  });
  it('says the store\'s words and changes nothing when the count is out of range', () => {
    const said = run(0.25);
    expect(said[0]!.t).toBe('That portion is out of range.');
    expect(st().diet[0]!.x).toBe(1);
  });
});
