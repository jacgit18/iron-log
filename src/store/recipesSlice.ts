import { newRecipeId, recipeError, recipeFromCatalog, withEditedMark } from '../lib/recipeDraft.js';
import { linkError, settleMeals } from '../lib/mealRollup.js';
import { removeTag, renameTag, tagLimitError } from '../lib/recipeTags.js';
import { missingParts, pantryStatus, suggestionPins } from '../lib/recipePantry.js';
import { MAX_RECIPES, normRecipe, normRecipes, normTags } from '../shared/recipes.js';
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
    const limit = tagLimitError(others, normTags(d.tags));
    if (limit) return limit;
    for (const i of d.ing) { const loop = i.rid && i.q !== undefined ? linkError(list, d.id, i.rid) : null; if (loop) return loop; } // a meal inside a meal: no loop, three levels at most
    const kept = d.id ? list.find(r => r.id === d.id) : undefined; // the star belongs to the recipe, not to the form
    const made = normRecipe({ ...d, ...(kept?.fav && d.fav === undefined ? { fav: true } : {}), id, n: clean(d.n) });
    if (!made) return 'That recipe can’t be saved.';
    const item = withEditedMark(d.id ? list.find(r => r.id === d.id) : undefined, made);
    set({ recipes: settleMeals(d.id ? list.map(r => (r.id === d.id ? item : r)) : [...list, item]) }); // meals built from this one follow its numbers and name
    get().saveRecipes();
    return null;
  },

  toggleRecipeFav(id) {
    const list = get().recipes;
    if (!list.some(r => r.id === id)) return;
    set({ recipes: list.map(r => { if (r.id !== id) return r; const { fav: _f, ...rest } = r; return r.fav ? rest : { ...rest, fav: true as const }; }) });
    get().saveRecipes();
  },

  copyCatalogRecipe(item: CatalogItem, servings?: number) {
    const list = get().recipes;
    if (list.some(r => r.from === item.id)) return 'That recipe is already in Mine.';
    if (list.length >= MAX_RECIPES) return recipeError(list, { n: item.name, ing: [{ n: 'x' }] });
    const r = recipeFromCatalog(item, list.map(x => x.id), servings);
    if (!r) return 'That recipe can’t be added.';
    set({ recipes: [...list, r] });
    get().saveRecipes();
    return null;
  },

  renameTag(from, to) {
    const r = renameTag(get().recipes, from, to);
    if (r.changed) { set({ recipes: r.list }); get().saveRecipes(); }
    return { error: r.error, name: r.name };
  },

  removeTag(tag) {
    const r = removeTag(get().recipes, tag);
    if (r.changed) { set({ recipes: r.list }); get().saveRecipes(); }
    return r.changed;
  },

  setRecipeChips(chips) {
    get().mutateCfg(c => { if (chips) c.recipeChips = chips; else delete c.recipeChips; });
  },

  setFoodTypes(choices, uses = {}) {
    const list = get().recipes;
    const hit = list.filter(r => r.cat === 'ready' && !r.type && choices[r.id]);
    if (!hit.length) return { changed: 0, undo: () => false };
    const ids = new Set(hit.map(r => r.id));
    set({ recipes: list.map(r => (ids.has(r.id) ? { ...r, type: choices[r.id]!, ...(uses[r.id]?.length ? { uses: uses[r.id]! } : {}) } : r)) });
    get().saveRecipes();
    const undo = () => {
      if (get().blocked()) return false;
      const now = get().recipes;
      if (!now.some(r => ids.has(r.id) && r.type === choices[r.id])) return false;
      set({ recipes: now.map(r => { if (!ids.has(r.id) || r.type !== choices[r.id]) return r; const { type: _t, uses: _u, ...rest } = r; return rest; }) });
      get().saveRecipes();
      return true;
    };
    return { changed: hit.length, undo };
  },

  removeRecipe(id) {
    const list = get().recipes; const i = list.findIndex(r => r.id === id);
    if (i < 0) return;
    const gone = list[i]!;
    const after = settleMeals(list.filter(r => r.id !== id)); // a meal that used it keeps the line as plain text and recounts
    const before = new Map(list.map(r => [r.id, r])), moved = after.filter(r => before.get(r.id) !== r); // the meals the delete changed: Undo gives them back as they were
    set({ recipes: after });
    get().saveRecipes();
    get().noteRemoved('recipes', gone.n, () => {
      if (get().blocked() || get().recipes.some(r => r.id === id)) return false;
      const back = new Map(moved.filter(m => get().recipes.find(r => r.id === m.id) === m).map(m => [m.id, before.get(m.id)!])); // only a meal not edited since
      const l = get().recipes.map(r => back.get(r.id) ?? r); l.splice(Math.min(i, l.length), 0, gone); set({ recipes: normRecipes(l) }); get().saveRecipes(); return true;
    });
  },

  linkIngredient(id, index, home) {
    const list = get().recipes; const r = list.find(x => x.id === id); const ing = r?.ing[index];
    if (!r || !ing) return;
    const { home: _old, ...rest } = ing;
    const next: RecipeIngredient = { ...rest, ...(home ? { home } : {}) };
    set({ recipes: list.map(x => (x.id === id ? { ...r, ing: r.ing.map((y, j) => (j === index ? next : y)) } : x)) });
    get().saveRecipes();
  },

  acceptSuggestions(id, month) {
    const list = get().recipes; const r = list.find(x => x.id === id);
    if (!r) return 0;
    const pins = new Map(suggestionPins(pantryStatus(r, get().grocery, get().groceryMonths[month] ?? { lines: {}, pulled: [] }, list)).map(p => [p.index, p.home]));
    if (!pins.size) return 0;
    set({ recipes: list.map(x => (x.id === id ? { ...r, ing: r.ing.map((y, j) => (pins.has(j) ? { ...y, home: pins.get(j)! } : y)) } : x)) });
    get().saveRecipes();
    return pins.size;
  },

  addMissingToGrocery(id, month) {
    const r = get().recipes.find(x => x.id === id);
    if (!r) return { added: 0, already: 0, refused: null };
    const status = pantryStatus(r, get().grocery, get().groceryMonths[month] ?? { lines: {}, pulled: [] }, get().recipes);
    const { already, add } = missingParts(status);
    let added = 0; let refused: string | null = null;
    for (const n of add) { const e = get().addGroceryItem({ n, store: '', qty: '1', price: '', every: false }); if (e) refused ??= e; else added++; }
    return { added, already: already.length, refused };
  },
});

export type { Recipe };
