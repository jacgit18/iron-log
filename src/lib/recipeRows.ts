import { hasMacros } from './dietLog.js';
import { isEatable } from './recipeUses.js';
import type { Recipe } from '../types.ts';

/* ---------- What a Recipes list row offers (brief recipes-list-compact). Pure. ---------- */

/** Whether a row gets a Log button: it has numbers to log and is something you eat (not only an ingredient). Otherwise the row shows an arrow that opens it. */
export const loggableRecipe = (r: Recipe): boolean => hasMacros(r) && isEatable(r);

/** What the Recent pill lists: the favourites and recent recipes (`picks`, in their order) that the search and filters still show. */
export function recentRows(narrowed: readonly Recipe[], picks: readonly { recipe: Recipe }[]): Recipe[] {
  const byId = new Map(narrowed.map(r => [r.id, r]));
  return picks.flatMap(p => byId.get(p.recipe.id) ?? []);
}
