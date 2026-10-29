import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import type { CatalogItem } from '../types.ts';

// Your recipes (ADR 084): saved as recipes/main, copied from the library, removed with Undo, checked against At home, and carried through the data file.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {}, recipes: [] });
});

const draft = { n: 'Chili', cat: 'protein' as const, ing: [{ n: 'beans' }], steps: ['Simmer.'] };
const lib: CatalogItem = { id: 'c:wbc:r1', name: 'Garlic Dressing', data: { recipe: { cat: 'sauces', ing: ['2 cloves garlic', '1 cup olive oil'], steps: ['Whisk.'] } } };

describe('saveRecipe', () => {
  it('creates a recipe with an id, then updates it in place', () => {
    expect(st().saveRecipe(draft)).toBeNull();
    const id = st().recipes[0]!.id;
    expect(st().saveRecipe({ ...draft, id, n: 'Better chili' })).toBeNull();
    expect(st().recipes).toHaveLength(1);
    expect(st().recipes[0]).toMatchObject({ id, n: 'Better chili' });
  });
  it('refuses a recipe with no name or no ingredient and changes nothing', () => {
    expect(st().saveRecipe({ ...draft, n: ' ' })).toBe('Give the recipe a name.');
    expect(st().saveRecipe({ ...draft, ing: [] })).toBe('Add at least one ingredient.');
    expect(st().recipes).toEqual([]);
  });
});

describe('copyCatalogRecipe', () => {
  it('adds a copy that remembers the library recipe, once', () => {
    expect(st().copyCatalogRecipe(lib)).toBeNull();
    expect(st().recipes[0]).toMatchObject({ n: 'Garlic Dressing', from: 'c:wbc:r1', ing: [{ n: 'garlic', amt: '2 cloves' }, { n: 'olive oil', amt: '1 cup' }] });
    expect(st().copyCatalogRecipe(lib)).toBe('That recipe is already in Mine.');
    expect(st().recipes).toHaveLength(1);
  });
});

describe('removeRecipe', () => {
  it('removes it and Undo puts it back where it was', () => {
    st().saveRecipe(draft); st().saveRecipe({ ...draft, n: 'Second' });
    const [first, second] = st().recipes;
    st().removeRecipe(first!.id);
    expect(st().recipes.map(r => r.id)).toEqual([second!.id]);
    expect(st().removed?.scope).toBe('recipes');
    expect(st().removed!.restore()).toBe(true);
    expect(st().recipes.map(r => r.id)).toEqual([first!.id, second!.id]);
  });
});

describe('addMissingToGrocery', () => {
  it('adds each missing ingredient once as an item to get, and counts those already on the list', async () => {
    const { monthKey } = await import('../lib/grocery.js');
    st().addGroceryItem({ n: 'Garlic', store: '', qty: '1', price: '', every: false });
    const garlic = st().grocery.items[0]!;
    st().saveRecipe({ n: 'Dressing', cat: 'sauces', ing: [{ n: 'garlic' }, { n: 'parsley' }, { n: 'fresh parsley' }], steps: [] });
    const id = st().recipes[0]!.id;
    expect(st().addMissingToGrocery(id, monthKey(new Date()))).toEqual({ added: 1, already: 1, refused: null });
    expect(st().grocery.items.map(i => i.n).sort()).toEqual(['Garlic', 'parsley']);
    st().setGroceryHave(monthKey(new Date()), garlic.id, true);
    expect(st().addMissingToGrocery(id, monthKey(new Date()))).toEqual({ added: 0, already: 1, refused: null }); // parsley is an item now: on To get, not added twice
  });
});

describe('addMissingToGrocery with a full list', () => {
  it('reports why nothing was added instead of saying everything is at home', async () => {
    const { monthKey, MAX_ITEMS } = await import('../lib/grocery.js');
    const { normGrocery } = await import('../lib/grocery.js');
    useAppStore.setState({ grocery: normGrocery({ stores: [], items: Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: `i${i}`, n: `Item ${i}`, store: '', qty: 1, cents: null, every: false, out: false })) }) });
    st().saveRecipe({ n: 'Dip', cat: 'sauces', ing: [{ n: 'saffron' }], steps: [] });
    const r = st().addMissingToGrocery(st().recipes[0]!.id, monthKey(new Date()));
    expect(r).toMatchObject({ added: 0, already: 0 });
    expect(r.refused).toBeTruthy();
  });
});

describe('the data file', () => {
  it('carries recipes out and back in, and a file without any reads the same', async () => {
    const { buildDataFile, normalizeData } = await import('../lib/export.js');
    st().saveRecipe(draft);
    const file = buildDataFile(st().snapshot(), {});
    expect(file.recipes).toHaveLength(1);
    expect(normalizeData(JSON.parse(JSON.stringify(file))).recipes).toEqual(file.recipes);
    useAppStore.setState({ recipes: [] });
    expect(buildDataFile(st().snapshot(), {})).not.toHaveProperty('recipes');
    expect(normalizeData({ config: {} })).not.toHaveProperty('recipes');
  });
});
