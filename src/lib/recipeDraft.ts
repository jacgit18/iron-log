import type { CatalogItem, Recipe } from '../types.ts';
import { MAX_RECIPES, normRecipe } from '../shared/recipes.js';
import { splitIngredient } from './recipePantry.js';

/* ---------- Making and checking a recipe (ADR 084): pure, so the store and the form share one rule ---------- */

/** A new id from the name: its words, then a short random tail so two recipes with one name never share an id. */
export function newRecipeId(used: Iterable<string>, name: string): string {
  const taken = new Set(used);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'recipe';
  for (;;) {
    const id = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    if (!taken.has(id)) return id;
  }
}

/** The recipe a catalog row becomes in your list: a copy you can change, remembering where it came from. */
export function recipeFromCatalog(item: CatalogItem, used: Iterable<string>): Recipe | null {
  const d = item.data.recipe;
  if (!d) return null;
  return normRecipe({ id: newRecipeId(used, item.name), n: item.name, cat: d.cat, ing: d.ing.map(splitIngredient), steps: d.steps, servings: d.servings, minutes: d.minutes, from: item.id });
}

/** Why a recipe can't be saved as it is, or null. `list` is your recipes without this one. */
export function recipeError(list: Recipe[], r: { n: string; ing: { n: string }[] }): string | null {
  if (!r.n.trim()) return 'Give the recipe a name.';
  if (!r.ing.some(i => i.n.trim())) return 'Add at least one ingredient.';
  if (list.length >= MAX_RECIPES) return `You can keep up to ${MAX_RECIPES} recipes. Delete one to add another.`;
  return null;
}
