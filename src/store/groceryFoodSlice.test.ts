import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import { createStaged } from '../lib/groceryReceipt.js';
import { MAX_RECIPES } from '../shared/recipes.js';
import type { Recipe } from '../types.ts';

// Brief groceries-make-foods: adding a list item makes its Food (every add path ends in addGroceryItem), links a matching one, and never blocks the add.
let useAppStore: typeof import('./useAppStore.js').useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {}, recipes: [], recipesLoaded: true, diet: [] });
});
const add = (n: string, over: Record<string, unknown> = {}) => st().addGroceryItem({ n, store: '', qty: '1', price: '', every: true, ...over });
const itemOf = (n: string) => st().grocery.items.find(i => i.n === n)!;
const foodOf = (n: string) => st().recipes.find(r => r.n === n);
const ready = (id: string, n: string, over: Partial<Recipe> = {}): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [], ...over });

describe('adding an item makes its Food', () => {
  it('makes one flagged, typed, pinned Food with the id g-<item id>', () => {
    expect(add('Whole milk')).toBeNull();
    const i = itemOf('Whole milk');
    expect(foodOf('Whole milk')).toMatchObject({ id: `g-${i.id}`, cat: 'ready', type: 'drink', home: i.id, fromGroc: true });
    expect(foodOf('Whole milk')!.kcal).toBeUndefined();
  });
  it('covers the receipt path (createStaged calls the same action)', () => {
    const plan = { steps: [{ kind: 'single', id: 's1', qty: 1, cents: 300 }] } as never;
    createStaged(plan, [{ id: 's1', n: 'Lasagna', store: '', qty: 1, cents: 300 } as never], { addGroceryItem: st().addGroceryItem, items: () => st().grocery.items });
    expect(foodOf('Lasagna')).toMatchObject({ fromGroc: true, type: 'ready' });
  });
  it('makes none for a one-time item', () => {
    add('Gum', { every: false, oneTime: true });
    expect(st().grocery.items).toHaveLength(1);
    expect(st().recipes).toHaveLength(0);
  });
  it('links an existing Food by name and pins it, making no second one', () => {
    useAppStore.setState({ recipes: [ready('own', 'Greek yogurt')] });
    add('Greek yogurt');
    expect(st().recipes).toHaveLength(1);
    expect(st().recipes[0]).toMatchObject({ id: 'own', home: itemOf('Greek yogurt').id });
    expect(st().recipes[0]!.fromGroc).toBeUndefined();
  });
  it('a refused add (duplicate name) makes no Food', () => {
    add('Rice');
    expect(add('rice')).toBe('That item is already in this store’s list.');
    expect(st().recipes).toHaveLength(1);
  });
  it('at the Foods cap the item is still added and no Food is made', () => {
    useAppStore.setState({ recipes: Array.from({ length: MAX_RECIPES }, (_, k) => ready(`f${k}`, `Food ${k}`)) });
    expect(add('Rice')).toBeNull();
    expect(st().grocery.items).toHaveLength(1);
    expect(st().recipes).toHaveLength(MAX_RECIPES);
  });
  it('makes nothing while the recipes list has not been read', () => {
    useAppStore.setState({ recipesLoaded: false });
    expect(add('Rice')).toBeNull();
    expect(st().recipes).toHaveLength(0);
  });
});

describe('Undo, delete and rename', () => {
  it('Undo of an add (quiet remove) takes back an untouched Food', () => {
    add('Rice');
    st().removeGroceryItem(itemOf('Rice').id, { quiet: true });
    expect(st().recipes).toHaveLength(0);
  });
  it('Undo leaves a Food that was changed, confirmed or planned, and unpins it', () => {
    add('Rice'); add('Oats'); add('Lasagna');
    st().setGroceryFoodType(foodOf('Rice')!.id, 'ready');
    st().confirmGroceryFoods([foodOf('Oats')!.id]);
    const l = foodOf('Lasagna')!;
    useAppStore.setState({ diet: [{ id: 'e1', d: '2026-11-22', n: 'Lasagna', kcal: 1, p: 1, from: l.id }] });
    for (const n of ['Rice', 'Oats', 'Lasagna']) st().removeGroceryItem(itemOf(n).id, { quiet: true });
    expect(st().recipes.map(r => r.n).sort()).toEqual(['Lasagna', 'Oats', 'Rice']);
    expect(st().recipes.every(r => r.home === undefined)).toBe(true);
  });
  it('deleting an item keeps its Food and clears the pin; repinFoods (the item Undo) pins it again', () => {
    add('Rice');
    const it = itemOf('Rice'), id = it.id;
    st().removeGroceryItem(id);
    expect(foodOf('Rice')).toBeDefined();
    expect(foodOf('Rice')!.home).toBeUndefined();
    useAppStore.setState({ grocery: { ...st().grocery, items: [it] } }); // the item's own Undo puts it back first
    st().repinFoods([foodOf('Rice')!.id], id);
    expect(foodOf('Rice')!.home).toBe(id);
  });
  it('renaming an item keeps the Food name and saves the old name as an alias', () => {
    add('Greek yogurt');
    st().updateGroceryItem(itemOf('Greek yogurt').id, { n: 'Yogurt tub' });
    expect(foodOf('Greek yogurt')).toBeDefined();
    expect(st().grocery.items[0]!.aliases).toEqual(['Greek yogurt']);
  });
  it('renaming an item with no Food adds no alias', () => {
    add('Gum', { every: false, oneTime: true });
    st().updateGroceryItem(st().grocery.items[0]!.id, { n: 'Mints' });
    expect(st().grocery.items[0]!.aliases).toBeUndefined();
  });
});

describe('confirm, type and the sweep', () => {
  it('a type chip changes the type and keeps the flag; Looks right clears it', () => {
    add('Lasagna');
    const id = foodOf('Lasagna')!.id;
    st().setGroceryFoodType(id, 'drink');
    expect(foodOf('Lasagna')).toMatchObject({ type: 'drink', fromGroc: true });
    expect(st().confirmGroceryFoods()).toBe(1);
    expect(foodOf('Lasagna')!.fromGroc).toBeUndefined();
    expect(st().confirmGroceryFoods()).toBe(0);
  });
  it('the sweep makes Foods only for items matching none, and a second tap makes none', () => {
    useAppStore.setState({ recipesLoaded: false });
    add('Rice'); add('Whole milk');
    useAppStore.setState({ recipesLoaded: true, recipes: [ready('own', 'Rice')] });
    expect(st().makeFoodsFromItems()).toEqual({ made: 1, waiting: 0 });
    expect(foodOf('Whole milk')).toMatchObject({ fromGroc: true, type: 'drink' });
    expect(st().makeFoodsFromItems()).toEqual({ made: 0, waiting: 0 });
  });
  it('saving a waiting Food through the form keeps the marker; Looks right clears it', () => {
    add('Lasagna');
    const f = foodOf('Lasagna')!;
    const { id: _id, fromGroc: _g, ...draft } = f; // the form's draft says nothing about the marker
    expect(st().saveRecipe({ ...draft, id: f.id, kcal: 300 })).toBeNull(); // e.g. a scan saved to the food
    expect(foodOf('Lasagna')).toMatchObject({ kcal: 300, fromGroc: true, home: f.home });
    st().confirmGroceryFoods([f.id]);
    expect(st().saveRecipe({ ...draft, id: f.id, kcal: 310 })).toBeNull();
    expect(foodOf('Lasagna')!.fromGroc).toBeUndefined();
  });
});
