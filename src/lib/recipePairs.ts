import { MAX_PAIRS, MAX_RECIPE_NAME } from '../shared/recipes.js';
import type { Recipe } from '../types.ts';
import { sortByName } from './sort.js';

/* ---------- Goes with (brief recipes-goes-with): chili goes with rice. Stored on both recipes (`pairs`), so either one shows the other. Pure; the store and the detail view call this. ---------- */

/** The recipes `r` goes with: the ones it lists, plus any recipe that lists it (an older copy of the app may have written one side only). Recipes that no longer exist are left out. */
export function pairsOf(r: Pick<Recipe, 'id' | 'pairs'>, list: readonly Recipe[]): Recipe[] {
  const ids = new Set(r.pairs ?? []);
  for (const o of list) if (o.pairs?.includes(r.id)) ids.add(o.id);
  ids.delete(r.id);
  return list.filter(o => ids.has(o.id));
}

/** Why `a` and `b` cannot be paired, in words, or null when they can. */
export function pairError(list: readonly Recipe[], aId: string, bId: string): string | null {
  const a = list.find(r => r.id === aId), b = list.find(r => r.id === bId);
  if (!a || !b) return 'That recipe is gone.';
  if (a.id === b.id) return 'A recipe cannot go with itself.';
  if (pairsOf(a, list).some(r => r.id === b.id)) return `${a.n} already goes with ${b.n}.`;
  const full = [a, b].find(r => pairsOf(r, list).length >= MAX_PAIRS);
  return full ? `${full.n} already goes with ${MAX_PAIRS} recipes. Remove one first.` : null;
}

const withPairs = (r: Recipe, pairs: string[]): Recipe => { const { pairs: _old, ...rest } = r; return pairs.length ? { ...rest, pairs } : rest; };

/** The list with `a` and `b` paired, each listing the other (the same list back when they cannot be paired). */
export function addPair(list: Recipe[], aId: string, bId: string): Recipe[] {
  if (pairError(list, aId, bId)) return list;
  return list.map(r => (r.id === aId ? withPairs(r, [...(r.pairs ?? []), bId]) : r.id === bId ? withPairs(r, [...(r.pairs ?? []), aId]) : r));
}

/** The list with `a` and `b` no longer paired, on both sides. */
export function removePair(list: Recipe[], aId: string, bId: string): Recipe[] {
  return list.map(r => (r.id === aId ? withPairs(r, (r.pairs ?? []).filter(x => x !== bId)) : r.id === bId ? withPairs(r, (r.pairs ?? []).filter(x => x !== aId)) : r));
}

/** The list after recipe `id` is deleted: nobody lists it any more. Recipes that did not list it come back as the same object. */
export function dropPairsTo(list: Recipe[], id: string): Recipe[] {
  return list.map(r => (r.pairs?.includes(id) ? withPairs(r, r.pairs.filter(x => x !== id)) : r));
}

/** Your recipes that can still be added to `r`'s Goes with: not itself, not already paired. Meals-from-foods cannot take sauces or seasonings as parts, so those are left out too. A to Z. */
export function pairCandidates(r: Pick<Recipe, 'id' | 'pairs'>, list: readonly Recipe[]): Recipe[] {
  const taken = new Set(pairsOf(r, list).map(x => x.id));
  return sortByName(list.filter(o => o.id !== r.id && !taken.has(o.id) && o.cat !== 'sauces' && o.cat !== 'seasonings'), o => o.n, o => o.id);
}

/** The meal "Make a meal" builds from a pair: "Chili with Rice", one serving of each part linked by id, so its numbers roll up from them. */
export function mealFromPair(a: Pick<Recipe, 'id' | 'n'>, b: Pick<Recipe, 'id' | 'n'>): Omit<Recipe, 'id'> {
  return { n: `${a.n} with ${b.n}`.slice(0, MAX_RECIPE_NAME), cat: 'other', servings: 1, ing: [{ n: a.n, rid: a.id, q: 1 }, { n: b.n, rid: b.id, q: 1 }], steps: [] };
}

/** Why this pair cannot be made into a meal, or null when it can: Sauces and Seasonings have their own picker and are never parts of a meal (the same rule `pairCandidates` uses for the list). */
export function mealPairError(a: Pick<Recipe, 'n' | 'cat'>, b: Pick<Recipe, 'n' | 'cat'>): string | null {
  const part = [a, b].find(x => x.cat === 'sauces' || x.cat === 'seasonings');
  return part ? `${part.n} is a ${part.cat === 'sauces' ? 'sauce' : 'seasoning'}, so it can’t be one part of a meal.` : null;
}

/** The meal that already links exactly these two recipes, so Make a meal opens it instead of building a second one. */
export function existingPairMeal(list: readonly Recipe[], aId: string, bId: string): Recipe | undefined {
  return list.find(m => m.ing.length === 2 && m.ing.every(i => i.q !== undefined && (i.rid === aId || i.rid === bId)) && new Set(m.ing.map(i => i.rid)).size === 2);
}
