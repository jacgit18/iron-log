import { MAX_PAIRS } from '../shared/recipes.js';
import type { Recipe } from '../types.ts';

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
