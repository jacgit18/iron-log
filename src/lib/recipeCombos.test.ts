import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { chipLabel, chipsShown, comboIds, comboParts, comboTabCounts, expandedRows, isCombo, mineRows, partsLine, sectionRows } from './recipeCombos.js';
import { filterRecipes } from './recipeList.js';

const food = (id: string, n: string, extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', type: 'ready', ing: [{ n }], steps: [], ...extra });
const meal = (id: string, n: string, parts: string[], extra: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'other', servings: 1, ing: parts.map(p => ({ n: p, rid: p, q: 1 })), steps: [], ...extra });
const cereal = food('cereal', 'Cereal'), milk = food('milk', 'Milk', { type: 'drink' }), rice = food('rice', 'Rice');
const cwm = meal('cwm', 'Cereal with Milk', ['cereal', 'milk']);
const bowl = meal('bowl', 'Breakfast bowl', ['cereal', 'milk']);
const ids = (l: readonly Recipe[]) => l.map(r => r.id).sort();

describe('isCombo', () => {
  const list = [cereal, milk, cwm];
  it('is true when every line is a linked item with an amount', () => { expect(isCombo(cwm, list)).toBe(true); expect(isCombo(meal('m', 'Only milk', ['milk']), list)).toBe(true); });
  it('is false for a typed ingredient, a link without an amount, a deleted item, no lines or a link to itself', () => {
    expect(isCombo({ ...cwm, ing: [...cwm.ing, { n: 'Honey' }] }, list)).toBe(false);
    expect(isCombo({ ...cwm, ing: [{ n: 'Cereal', rid: 'cereal' }, { n: 'Milk', rid: 'milk', q: 1 }] }, list)).toBe(false);
    expect(isCombo(cwm, [cereal, cwm])).toBe(false);
    expect(isCombo({ ...cwm, ing: [] }, list)).toBe(false);
    expect(isCombo({ ...cwm, ing: [{ n: 'x', rid: 'cwm', q: 1 }] }, list)).toBe(false);
    expect(isCombo(cereal, list)).toBe(false);
  });
});

describe('parts and chips', () => {
  it('names the parts and the chip', () => {
    expect(partsLine(cwm, [cereal, milk, cwm])).toBe('Cereal + Milk');
    expect(comboParts(cereal, [cereal])).toEqual([]);
    expect(chipLabel(cereal, cwm)).toBe('with Milk');
    expect(chipLabel(milk, cwm)).toBe('Cereal with Milk');
    expect(chipLabel(cereal, bowl)).toBe('Breakfast bowl');
    expect(chipLabel(cereal, meal('x', 'cereal with oats', []))).toBe('with oats');
  });
  it('shows two chips and counts the rest', () => {
    const c = (n: string) => ({ id: n, label: n, name: n });
    expect(chipsShown([c('a'), c('b'), c('c'), c('d')])).toMatchObject({ more: 2, shown: [{ id: 'a' }, { id: 'b' }] });
    expect(chipsShown([c('a')])).toMatchObject({ more: 0 });
    const open = chipsShown([c('a'), c('b'), c('c'), c('d')], true);
    expect(open.shown.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(open.more).toBe(2); // still above 0, so the button stays to say "Show fewer"
  });

  it('a row stays expanded only while it has chips beyond the cap', () => {
    const c = (n: string) => ({ id: n, label: n, name: n });
    const chips = new Map([['many', [c('a'), c('b'), c('c')]], ['two', [c('a'), c('b')]]]);
    expect(expandedRows(['many', 'two', 'gone'], chips)).toEqual(['many']); // at the cap the button is gone; a row not shown has no chips
    expect(expandedRows(['many'], new Map())).toEqual([]); // Recent and Meals draw no chips
  });
});

describe('mineRows', () => {
  const all = [cereal, milk, rice, cwm];
  it('hides the combo on All and puts a chip on each part', () => {
    const { rows, chips } = mineRows(all, all, 'all');
    expect(ids(rows)).toEqual(['cereal', 'milk', 'rice']);
    expect(chips.get('cereal')).toEqual([{ id: 'cwm', label: 'with Milk', name: 'Cereal with Milk' }]);
    expect(chips.get('milk')?.[0]?.label).toBe('Cereal with Milk');
    expect(chips.has('rice')).toBe(false);
  });
  it('keeps the chip only on the parts the tab shows', () => {
    const foods = mineRows(all, all, 'foods');
    expect(ids(foods.rows)).toEqual(['cereal', 'rice']);
    expect(foods.chips.has('milk')).toBe(false);
    expect(foods.chips.get('cereal')).toHaveLength(1);
    expect(ids(mineRows(all, all, 'drinks').rows)).toEqual(['milk']);
  });
  it('lists the combo as its own row, with no chips, on Meals', () => {
    const { rows, chips } = mineRows(all, all, 'meals');
    expect(ids(rows)).toEqual(['cwm']);
    expect(chips.size).toBe(0);
  });
  it('shows a combo whose name matches but no part does as its own row; a word of a part keeps it a chip', () => {
    const list = [cereal, milk, bowl];
    const f = (q: string) => filterRecipes(list, { q, cat: null, canMake: false }, new Set());
    expect(ids(mineRows(f('breakfast'), list, 'all').rows)).toEqual(['bowl']);
    const cer = mineRows(f('cereal'), list, 'all');
    expect(ids(cer.rows)).toEqual(['cereal']);
    expect(cer.chips.get('cereal')?.[0]?.id).toBe('bowl');
  });
  it('shows a matching combo as its own row when a filter leaves none of its parts', () => {
    const fav = { ...cwm, fav: true as const };
    const list = [cereal, milk, fav];
    const matched = list.filter(r => r.fav);
    expect(ids(mineRows(matched, list, 'all').rows)).toEqual(['cwm']);
    expect(ids(mineRows(matched, list, 'foods').rows)).toEqual([]);
  });
  it('lists a combo of a deleted part as a normal row', () => {
    const list = [cereal, cwm];
    expect(ids(mineRows(list, list, 'all').rows)).toEqual(['cereal', 'cwm']);
  });
  it('lists a one-part combo as a chip on its part', () => {
    const only = meal('om', 'Milk bowl', ['milk']);
    const list = [milk, only];
    expect(ids(mineRows(list, list, 'all').rows)).toEqual(['milk']);
  });
  it('only reads: the recipes come back untouched', () => {
    const before = JSON.stringify(all);
    mineRows(all, all, 'all'); comboTabCounts(all, all);
    expect(JSON.stringify(all)).toBe(before);
  });
});

describe('comboTabCounts', () => {
  it('equals the rows each tab shows, and All no longer counts combos', () => {
    const all = [cereal, milk, rice, cwm];
    const n = comboTabCounts(all, all);
    expect(n).toEqual({ all: 3, foods: 2, meals: 1, ingredients: 0, drinks: 1 });
    for (const t of ['all', 'foods', 'meals', 'ingredients', 'drinks'] as const) expect(n[t]).toBe(mineRows(all, all, t).rows.length);
  });
});

describe('comboIds', () => {
  it('lists the combos in one pass, the same ones isCombo finds', () => {
    const list = [cereal, milk, rice, cwm, bowl, meal('x', 'Gone', ['nope'])];
    expect([...comboIds(list)].sort()).toEqual(['bowl', 'cwm']);
    for (const r of list) expect(comboIds(list).has(r.id)).toBe(isCombo(r, list));
  });
  it('treats a combo made of combos as a combo, chipped only on its direct parts', () => {
    const big = meal('big', 'Big breakfast', ['cwm', 'milk']);
    const list = [cereal, milk, cwm, big];
    const { rows, chips } = mineRows(list, list, 'all');
    expect(ids(rows)).toEqual(['cereal', 'milk']);
    expect(chips.get('milk')?.map(c => c.id).sort()).toEqual(['big', 'cwm']);
    expect(chips.get('cereal')?.map(c => c.id)).toEqual(['cwm']);
  });
  it('shows a combo made only of combos as its own row, so it is never lost', () => {
    const only = meal('only', 'Only combos', ['cwm', 'bowl']);
    const list = [cereal, milk, cwm, bowl, only];
    expect(ids(mineRows(list, list, 'all').rows)).toEqual(['cereal', 'milk', 'only']);
  });
});

describe('sectionRows', () => {
  const all = [cereal, milk, rice, cwm];
  it('lists exactly the items of the section, so the count equals the rows; a combo is a Meals row', () => {
    expect(ids(sectionRows(all, all, 'meals').rows)).toEqual(['cwm']);
    expect(ids(sectionRows(all, all, 'ready').rows)).toEqual(['cereal', 'rice']);
    expect(ids(sectionRows(all, all, 'drinks').rows)).toEqual(['milk']);
    expect(sectionRows(all, all, 'meals').chips.size).toBe(0);
  });
  it('chips a combo onto the part rows shown in the other sections, never hiding a row', () => {
    const r = sectionRows(all, all, 'ready');
    expect(r.chips.get('cereal')).toEqual([{ id: 'cwm', label: 'with Milk', name: 'Cereal with Milk' }]);
    expect(r.chips.has('rice')).toBe(false);
    expect(sectionRows(all, all, 'drinks').chips.get('milk')?.[0]?.id).toBe('cwm');
  });
  it('does not chip a combo that has steps (it is a Recipes row, not a meal with no steps)', () => {
    const stepped = { ...cwm, steps: ['mix'] };
    const list = [cereal, milk, stepped];
    expect(sectionRows(list, list, 'ready').chips.size).toBe(0);
    expect(ids(sectionRows(list, list, 'recipes').rows)).toEqual(['cwm']);
  });
  it('has no rows or chips for Library (its rows are the catalog)', () => {
    expect(sectionRows(all, all, 'library')).toEqual({ rows: [], chips: new Map() });
  });
});
