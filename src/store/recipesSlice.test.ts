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

describe('Edited mark', () => {
  const copy = () => { st().copyCatalogRecipe(lib); return st().recipes[0]!; };
  const resave = (r: ReturnType<typeof copy>, patch: object = {}) => st().saveRecipe({ ...r, ...patch });
  it('stays off an untouched copy, also when it is saved again as it is', () => {
    const r = copy();
    expect(r).not.toHaveProperty('edited');
    expect(resave(r)).toBeNull();
    expect(st().recipes[0]).not.toHaveProperty('edited');
  });
  it('turns on when a swap or a skip is saved, and stays on', () => {
    const r = copy();
    resave(r, { ing: [{ ...r.ing[0]!, sub: 'shallot' }, ...r.ing.slice(1)] });
    expect(st().recipes[0]).toMatchObject({ edited: true, ing: [{ n: 'garlic', sub: 'shallot' }, { n: 'olive oil' }] });
    resave(st().recipes[0]!);
    expect(st().recipes[0]).toHaveProperty('edited', true);
  });
  it('never appears on a recipe you wrote', () => {
    st().saveRecipe(draft);
    const r = st().recipes[0]!;
    resave(r, { n: 'Chili 2' });
    expect(st().recipes[0]).not.toHaveProperty('edited');
  });
  it('is not set by pinning an ingredient to an At home item, and a pin keeps the swap', () => {
    const r = copy();
    resave(r, { ing: [{ ...r.ing[0]!, sub: 'shallot' }, ...r.ing.slice(1)] });
    st().linkIngredient(r.id, 0, 'item-1');
    expect(st().recipes[0]!.ing[0]).toEqual({ n: 'garlic', amt: '2 cloves', sub: 'shallot', home: 'item-1' });
    st().linkIngredient(r.id, 0, null);
    expect(st().recipes[0]!.ing[0]).toEqual({ n: 'garlic', amt: '2 cloves', sub: 'shallot' });
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

describe('acceptSuggestions', () => {
  it('pins every Maybe at once, leaves matched, skipped and water ingredients alone, and then has nothing left', async () => {
    const { monthKey } = await import('../lib/grocery.js');
    for (const n of ['Peanut butter', 'Roasted garlic powder', 'Rice']) st().addGroceryItem({ n, store: '', qty: '1', price: '', every: false });
    const id_ = (n: string) => st().grocery.items.find(i => i.n === n)!.id;
    const pb = { id: id_('Peanut butter') }, gp = { id: id_('Roasted garlic powder') };
    st().saveRecipe({ n: 'Sauce', cat: 'sauces', ing: [{ n: 'butter' }, { n: 'garlic' }, { n: 'rice' }, { n: 'water' }, { n: 'butter', skip: true }], steps: [] });
    const id = st().recipes[0]!.id;
    expect(st().acceptSuggestions(id, monthKey(new Date()))).toBe(2);
    expect(st().recipes[0]!.ing.map(i => i.home ?? null)).toEqual([pb.id, gp.id, null, null, null]);
    expect(st().acceptSuggestions(id, monthKey(new Date()))).toBe(0);
    expect(st().acceptSuggestions('gone', monthKey(new Date()))).toBe(0);
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

describe('linked sauces', () => {
  const sauce = { n: 'Taco seasoning', cat: 'seasonings' as const, ing: [{ n: 'cumin' }], steps: [] };
  const setup = async () => {
    const { linkedRecipe } = await import('../lib/recipeSuggest.js');
    st().saveRecipe(sauce);
    const sid = st().recipes[0]!.id;
    expect(st().saveRecipe({ n: 'Tacos', cat: 'protein', ing: [{ n: 'Taco seasoning', amt: '2 tbsp', rid: sid }, { n: 'beef' }], steps: [] })).toBeNull();
    const taco = () => st().recipes.find(r => r.n === 'Tacos')!;
    return { sid, taco, linkedRecipe };
  };
  it('keeps the link when saved, and the pantry counts the line as before', async () => {
    const { sid, taco } = await setup();
    expect(taco().ing[0]).toEqual({ n: 'Taco seasoning', amt: '2 tbsp', rid: sid });
    const { pantryStatus } = await import('../lib/recipePantry.js');
    expect(pantryStatus(taco(), st().grocery, { lines: {}, pulled: [] })).toMatchObject({ have: 0, total: 2 });
  });
  it('deleting the sauce leaves the ingredient as plain text, and Undo brings the link back', async () => {
    const { sid, taco, linkedRecipe } = await setup();
    st().removeRecipe(sid);
    expect(taco().ing[0]!.n).toBe('Taco seasoning');
    expect(linkedRecipe(taco().ing[0]!, st().recipes)).toBeUndefined();
    expect(st().removed!.restore()).toBe(true);
    expect(linkedRecipe(taco().ing[0]!, st().recipes)?.id).toBe(sid);
  });
  it('renaming the sauce shows the new name on the link, and the stored name is refreshed when the recipe is saved again', async () => {
    const { sid, taco, linkedRecipe } = await setup();
    expect(st().saveRecipe({ ...st().recipes[0]!, n: 'Taco mix' })).toBeNull();
    expect(linkedRecipe(taco().ing[0]!, st().recipes)?.n).toBe('Taco mix');
    const { refreshLink } = await import('../lib/recipeSuggest.js');
    expect(st().saveRecipe({ ...taco(), ing: taco().ing.map(i => refreshLink(i, st().recipes)) })).toBeNull();
    expect(taco().ing[0]).toEqual({ n: 'Taco mix', amt: '2 tbsp', rid: sid });
  });
});


describe('recipe tags', () => {
  const tagged = async () => {
    for (const [n, tags] of [['Chili', ['weeknight', 'Meal prep']], ['Tacos', ['Weeknight']], ['Soup', ['meal prep']], ['Cake', []]] as const) {
      expect(st().saveRecipe({ ...draft, n, ...(tags.length ? { tags: [...tags] } : {}) })).toBeNull();
    }
    return (n: string) => st().recipes.find(r => r.n === n)!;
  };
  it('saves tags on the recipe and cleans them', () => {
    expect(st().saveRecipe({ ...draft, tags: ['  weeknight ', 'WEEKNIGHT'] })).toBeNull();
    expect(st().recipes[0]!.tags).toEqual(['weeknight']);
  });
  it('refuses a recipe that would take the list past the tag limit', () => {
    for (let i = 0; i < 5; i++) expect(st().saveRecipe({ ...draft, n: `R${i}`, tags: Array.from({ length: 6 }, (_, j) => `t${i * 6 + j}`) })).toBeNull();
    expect(st().saveRecipe({ ...draft, n: 'Last', tags: ['one more'] })).toMatch(/up to 30 different tags/);
    expect(st().saveRecipe({ ...draft, n: 'Last', tags: ['T0'] })).toBeNull(); // a tag already in use is not new
  });
  it('renames a tag on every recipe that has it, without touching the rest', async () => {
    const get = await tagged();
    expect(st().renameTag('weeknight', 'quick')).toEqual({ error: null, name: 'quick' });
    expect(get('Chili').tags).toEqual(['quick', 'Meal prep']);
    expect(get('Tacos').tags).toEqual(['quick']);
    expect(get('Soup').tags).toEqual(['meal prep']);
    expect(st().recipes).toHaveLength(4);
  });
  it('merges into a tag that exists, keeping its spelling and not doubling it on a recipe', async () => {
    const get = await tagged();
    expect(st().renameTag('weeknight', 'MEAL PREP')).toEqual({ error: null, name: 'Meal prep' }); // the spelling in use, not the typed one
    expect(get('Chili').tags).toEqual(['Meal prep']); // had both: now one
    expect(get('Tacos').tags).toEqual(['Meal prep']);
    expect(get('Soup').tags).toEqual(['meal prep']);
  });
  it('refuses an empty new name and changes nothing', async () => {
    const get = await tagged();
    expect(st().renameTag('weeknight', '   ').error).toMatch(/name/);
    expect(get('Tacos').tags).toEqual(['Weeknight']);
  });
  it('deletes a tag from every recipe and says how many had it; the recipes stay', async () => {
    const get = await tagged();
    expect(st().removeTag('WEEKNIGHT')).toBe(2);
    expect(get('Chili').tags).toEqual(['Meal prep']);
    expect('tags' in get('Tacos')).toBe(false);
    expect(st().recipes).toHaveLength(4);
    expect(st().removeTag('weeknight')).toBe(0);
  });
});

describe('setRecipeChips', () => {
  it('saves the chip setting in the settings and clears it', () => {
    st().setRecipeChips({ hide: ['drinks'] });
    expect(st().cfg.recipeChips).toEqual({ hide: ['drinks'] });
    st().setRecipeChips(undefined);
    expect('recipeChips' in st().cfg).toBe(false);
  });
});
