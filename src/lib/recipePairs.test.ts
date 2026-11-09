import { describe, expect, it } from 'vitest';
import { MAX_PAIRS, cleanPairs, normRecipe, validRecipe } from '../shared/recipes.js';
import type { Recipe } from '../types.ts';
import { addPair, dropPairsTo, existingPairMeal, mealFromPair, mealPairError, pairCandidates, pairError, pairsOf, removePair } from './recipePairs.js';

const r = (id: string, pairs?: string[]): Recipe => ({ id, n: id.toUpperCase(), cat: 'protein', ing: [{ n: 'x' }], steps: ['Cook.'], ...(pairs ? { pairs } : {}) });
const names = (list: Recipe[]) => list.map(x => x.id);

describe('cleanPairs', () => {
  it('keeps text ids once, drops its own and reserved ones, caps at MAX_PAIRS', () => {
    expect(cleanPairs(['b', 'b', 'me', 4, '', 'c', 'd', 'e'], 'me')).toEqual(['b', 'c', 'd']);
    expect(MAX_PAIRS).toBe(3);
  });
  it('is null for nothing usable', () => { expect(cleanPairs(undefined, 'me')).toBeNull(); expect(cleanPairs([], 'me')).toBeNull(); expect(cleanPairs(['me'], 'me')).toBeNull(); });
  it('survives the server cleaner as it came (a sync round trip)', () => {
    const rec = r('chili', ['rice']);
    expect(validRecipe(rec)).toBe(true);
    expect(normRecipe(rec)?.pairs).toEqual(['rice']);
    expect(normRecipe({ ...rec, pairs: ['chili', 'rice', 'rice'] })?.pairs).toEqual(['rice']);
  });
});

describe('pairing', () => {
  const list = [r('chili'), r('rice'), r('beans'), r('salad')];
  it('adds a pair on both sides and shows it from either', () => {
    const next = addPair(list, 'chili', 'rice');
    expect(next.find(x => x.id === 'chili')?.pairs).toEqual(['rice']);
    expect(next.find(x => x.id === 'rice')?.pairs).toEqual(['chili']);
    expect(names(pairsOf(next[1]!, next))).toEqual(['chili']);
  });
  it('shows a one-sided pair (an older copy wrote one side) from the other recipe too', () => {
    const one = [r('chili', ['rice']), r('rice')];
    expect(names(pairsOf(one[1]!, one))).toEqual(['chili']);
  });
  it('refuses itself, a repeat, a missing recipe and a full side, with a reason', () => {
    expect(pairError(list, 'chili', 'chili')).toMatch(/itself/);
    expect(pairError(list, 'chili', 'ghost')).toMatch(/gone/);
    const paired = addPair(list, 'chili', 'rice');
    expect(pairError(paired, 'rice', 'chili')).toMatch(/already goes with/);
    let full = list;
    for (const id of ['rice', 'beans', 'salad']) full = addPair(full, 'chili', id);
    const more = [...full, r('bread')];
    expect(pairError(more, 'bread', 'chili')).toMatch(/already goes with 3/);
    expect(addPair(more, 'bread', 'chili')).toBe(more);
  });
  it('removes a pair from both sides and drops an empty list', () => {
    const next = removePair(addPair(list, 'chili', 'rice'), 'rice', 'chili');
    expect(next.every(x => x.pairs === undefined)).toBe(true);
  });
  it('deleting a recipe removes it from everyone who listed it and leaves the rest untouched', () => {
    const paired = addPair(addPair(list, 'chili', 'rice'), 'beans', 'salad');
    const next = dropPairsTo(paired, 'rice');
    expect(next.find(x => x.id === 'chili')?.pairs).toBeUndefined();
    expect(next.find(x => x.id === 'beans')).toBe(paired.find(x => x.id === 'beans'));
  });
});

describe('pairCandidates and mealFromPair', () => {
  const sauce: Recipe = { ...r('salsa'), cat: 'sauces' };
  const list = [r('chili'), r('rice'), r('beans'), sauce];
  it('offers the others A to Z, not itself, a partner or a sauce', () => {
    expect(names(pairCandidates(list[0]!, list))).toEqual(['beans', 'rice']);
    const paired = addPair(list, 'chili', 'rice');
    expect(names(pairCandidates(paired[0]!, paired))).toEqual(['beans']);
  });
  it('builds a one-serving meal that links both parts by id', () => {
    const m = mealFromPair({ id: 'chili', n: 'Chili' }, { id: 'rice', n: 'Rice' });
    expect(m).toMatchObject({ n: 'Chili with Rice', cat: 'other', servings: 1 });
    expect(m.ing).toEqual([{ n: 'Chili', rid: 'chili', q: 1 }, { n: 'Rice', rid: 'rice', q: 1 }]);
    expect(mealFromPair({ id: 'a', n: 'x'.repeat(60) }, { id: 'b', n: 'y'.repeat(60) }).n.length).toBe(80);
  });
});

describe('mealPairError and existingPairMeal', () => {
  const chili = r('chili'), rice = r('rice'), salsa: Recipe = { ...r('salsa'), cat: 'sauces' }, spice: Recipe = { ...r('cumin'), cat: 'seasonings' };
  it('refuses a pair with a sauce or a seasoning in it, naming which', () => {
    expect(mealPairError(chili, rice)).toBeNull();
    expect(mealPairError(chili, salsa)).toBe('SALSA is a sauce, so it can’t be one part of a meal.');
    expect(mealPairError(spice, rice)).toBe('CUMIN is a seasoning, so it can’t be one part of a meal.');
  });
  it('finds the meal that links exactly these two, either order, and not a meal with a third part', () => {
    const meal: Recipe = { ...r('m1'), ing: [{ n: 'chili', rid: 'chili', q: 1 }, { n: 'rice', rid: 'rice', q: 1 }] };
    const three: Recipe = { ...r('m2'), ing: [{ n: 'chili', rid: 'chili', q: 1 }, { n: 'rice', rid: 'rice', q: 1 }, { n: 'beans', rid: 'beans', q: 1 }] };
    expect(existingPairMeal([chili, rice, meal], 'rice', 'chili')?.id).toBe('m1');
    expect(existingPairMeal([chili, rice, three], 'chili', 'rice')).toBeUndefined();
    expect(existingPairMeal([chili, rice], 'chili', 'rice')).toBeUndefined();
  });
});
