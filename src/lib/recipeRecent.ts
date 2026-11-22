import type { DietEntry, Recipe } from '../types.ts';
import { inSection, type FoodSection } from './foodSections.js';
import { nameCmp } from './sort.js';

/* ---------- Recent and favorites (brief recipes-find-type-tabs): the chips above the Recipes list. Pure; nothing here is stored (a star is `Recipe.fav`). ---------- */

export const MAX_QUICK = 8;

/** The recipe ids used lately, newest first, no repeats: what was opened this visit (`opened`, newest last), then what the diet log took from a recipe (newest day first, entries in log order). */
export function recentIds(recipes: readonly Recipe[], diet: readonly DietEntry[], opened: readonly string[]): string[] {
  const known = new Set(recipes.map(r => r.id));
  const logged = diet.filter(e => e.from && known.has(e.from)).map((e, i) => ({ id: e.from!, d: e.d, i })).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.i - a.i)).map(e => e.id);
  return [...new Set([...[...opened].reverse(), ...logged])].filter(id => known.has(id));
}

/** The chips: starred recipes first (by name), then recent ones that are not starred, at most MAX_QUICK in all. With a `section` (brief foods-made-and-store-bought) only that section's items count,
 *  so Recent never mixes sections; Library has none (its rows are not your recipes). */
export function quickPicks(all: readonly Recipe[], diet: readonly DietEntry[], opened: readonly string[], section?: FoodSection): { recipe: Recipe; fav: boolean }[] {
  const recipes = section ? all.filter(r => inSection(r, section)) : all;
  const byId = new Map(recipes.map(r => [r.id, r]));
  const favs = recipes.filter(r => r.fav).sort(nameCmp<Recipe>(r => r.n, r => r.id));
  const recent = recentIds(recipes, diet, opened).map(id => byId.get(id)!).filter(r => !r.fav);
  return [...favs.map(recipe => ({ recipe, fav: true })), ...recent.map(recipe => ({ recipe, fav: false }))].slice(0, MAX_QUICK);
}
