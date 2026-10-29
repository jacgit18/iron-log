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

// What counts as changing a recipe: everything you can edit in the form. `edited` itself and `id` are not part of it.
// Compared the way the form hands them back (name spaces collapsed, steps one per line), so saving a copy unchanged never marks it.
const lines = (steps: string[]) => steps.join('\n').split('\n').map(s => s.trim()).filter(Boolean);
// The pin to an At home item (`home`) is a link, not a change to the recipe, so it is left out (pinning from the detail never marks either).
const content = (r: Recipe) => JSON.stringify([r.n.replace(/\s+/g, ' ').trim(), r.cat, r.ing.map(({ home: _h, ...i }) => i), lines(r.steps), r.servings ?? null, r.minutes ?? null, r.note ?? null]);

/** `next` with the Edited mark: set when it has a library source and its content differs from `prev`, kept once set. A recipe written from
 *  scratch (no `from`) never gets it; saving without a change leaves the mark as it was. */
export function withEditedMark(prev: Recipe | undefined, next: Recipe): Recipe {
  if (!next.from) return next;
  const { edited: _drop, ...rest } = next;
  return prev && (prev.edited || content(prev) !== content(next)) ? { ...rest, edited: true } : rest;
}

/** The credit line for a recipe from the Wikibooks Cookbook (CC BY-SA asks for it on every copy), or null when it needs none. */
export function attribution(r: Pick<Recipe, 'from' | 'edited'>, mine: boolean): string | null {
  return !mine || r.from?.startsWith('c:wbc:') ? `${r.edited ? 'Adapted from' : 'From'} the Wikibooks Cookbook, CC BY-SA 4.0.` : null;
}
