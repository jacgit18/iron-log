import { newRecipeId, recipeError, recipeFromCatalog } from '../lib/recipeDraft.js';
import { missingParts, pantryStatus } from '../lib/recipePantry.js';
import { MAX_RECIPES, normRecipe, normRecipes } from '../shared/recipes.js';
import type { CatalogItem, Recipe, RecipeIngredient } from '../types.ts';
import type { RecipesSlice, StoreGet, StoreSet } from './types.ts';

// Your recipes (ADR 084): one document, recipes/main, saved like every other (synced when syncing is on, in this browser otherwise). A
// recipe copied from the catalog is a snapshot of its own; what you change on it stays yours.
const MAIN = 'recipes/main';
const clean = (n: string) => n.replace(/\s+/g, ' ').trim();

export const recipesSlice = (set: StoreSet, get: StoreGet): RecipesSlice => ({
  recipes: [],

  saveRecipes() { get().saveDoc(MAIN, { items: get().recipes }); },

  saveRecipe(d) {
    const list = get().recipes;
    const others = d.id ? list.filter(r => r.id !== d.id) : list;
    const err = recipeError(others, d);
    if (err) return err;
    const id = d.id ?? newRecipeId(list.map(r => r.id), d.n);
    const item = normRecipe({ ...d, id, n: clean(d.n) });
    if (!item) return 'That recipe can’t be saved.';
    set({ recipes: d.id ? list.map(r => (r.id === d.id ? item : r)) : [...list, item] });
    get().saveRecipes();
    return null;
  },

  copyCatalogRecipe(item: CatalogItem) {
    const list = get().recipes;
    if (list.some(r => r.from === item.id)) return 'That recipe is already in Mine.';
    if (list.length >= MAX_RECIPES) return recipeError(list, { n: item.name, ing: [{ n: 'x' }] });
    const r = recipeFromCatalog(item, list.map(x => x.id));
    if (!r) return 'That recipe can’t be added.';
    set({ recipes: [...list, r] });
    get().saveRecipes();
    return null;
  },

  removeRecipe(id) {
    const list = get().recipes; const i = list.findIndex(r => r.id === id);
    if (i < 0) return;
    const gone = list[i]!;
    set({ recipes: list.filter(r => r.id !== id) });
    get().saveRecipes();
    get().noteRemoved('recipes', gone.n, () => {
      if (get().blocked() || get().recipes.some(r => r.id === id)) return false;
      const l = [...get().recipes]; l.splice(Math.min(i, l.length), 0, gone); set({ recipes: normRecipes(l) }); get().saveRecipes(); return true;
    });
  },

  linkIngredient(id, index, home) {
    const list = get().recipes; const r = list.find(x => x.id === id); const ing = r?.ing[index];
    if (!r || !ing) return;
    const next: RecipeIngredient = { n: ing.n, ...(ing.amt ? { amt: ing.amt } : {}), ...(home ? { home } : {}) };
    set({ recipes: list.map(x => (x.id === id ? { ...r, ing: r.ing.map((y, j) => (j === index ? next : y)) } : x)) });
    get().saveRecipes();
  },

  addMissingToGrocery(id, month) {
    const r = get().recipes.find(x => x.id === id);
    if (!r) return { added: 0, already: 0 };
    const status = pantryStatus(r, get().grocery, get().groceryMonths[month] ?? { lines: {}, pulled: [] });
    const { already, add } = missingParts(status);
    let added = 0;
    for (const n of add) if (!get().addGroceryItem({ n, store: '', qty: '1', price: '', every: false })) added++;
    return { added, already: already.length };
  },
});

export type { Recipe };
