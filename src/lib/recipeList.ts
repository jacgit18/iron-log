import type { Recipe, RecipeCategory } from '../types.ts';
import { nameWords } from './recipePantry.js';
import { matchesNutrition, type NutritionKey } from './recipeNutrition.js';
import { hasTags } from './recipeTags.js';
import { nameCmp } from './sort.js';
import type { SortOption } from './sortChoice.js';

/* ---------- Which of your recipes the list shows (ADR 084): pure, so a rule here is a node test, not a browser test ---------- */

export interface RecipeFilter { q: string; cat: RecipeCategory | null; canMake: boolean; tags?: readonly string[]; nutrition?: readonly NutritionKey[] }

const textWords = (s: string) => s.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Your recipes matching the typed words (every word in the name or an ingredient, as a word start), the category AND every selected tag AND every nutrition filter, and "can make"
 *  (`makeable`: ids of recipes with every ingredient at home), by name. */
export function filterRecipes(list: Recipe[], f: RecipeFilter, makeable: ReadonlySet<string>): Recipe[] {
  const words = textWords(f.q);
  return list
    .filter(r => (!f.cat || r.cat === f.cat) && (!f.tags?.length || hasTags(r, f.tags)) && (!f.nutrition?.length || matchesNutrition(r, f.nutrition)) && (!f.canMake || makeable.has(r.id)))
    .filter(r => {
      if (!words.length) return true;
      const hay = ` ${textWords(`${r.n} ${r.ing.map(i => `${i.n} ${i.sub ?? ''}`).join(' ')}`).join(' ')}`;
      return words.every(w => hay.includes(` ${w}`));
    })
    .sort(nameCmp(r => r.n, r => r.id));
}

/** The line under a recipe in a list: "Sauces · 4 servings · 25 min". */
export function recipeMeta(label: string, servings?: number, minutes?: number): string {
  const time = minutes ? (minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`) : '';
  return [label, servings ? `${servings} serving${servings === 1 ? '' : 's'}` : '', time].filter(Boolean).join(' · ');
}

/** Steps typed one per line, as a list (blank lines dropped). */
export const stepsFromText = (t: string): string[] => t.split('\n').map(s => s.trim()).filter(Boolean);

/** Whether a typed name is one the person already has as a recipe (used to warn, not to refuse). */
export const sameName = (list: Recipe[], name: string, exceptId?: string) => list.some(r => r.id !== exceptId && nameWords(r.n).join(' ') === nameWords(name).join(' '));

/* ---------- Order of your recipes (brief recipes-sort) ---------- */

/** Mine's sort choices. The first is the default. "Newest" is the order recipes were added (the list is appended to; a recipe has no date). */
export const RECIPE_SORTS = [
  { key: 'name', label: 'Name A to Z' },
  { key: 'newest', label: 'Newest added' },
  { key: 'time', label: 'Quickest first' },
  { key: 'kcal', label: 'Fewest calories' },
  { key: 'canmake', label: 'Can make first' },
] as const satisfies readonly SortOption[];
export type RecipeSort = typeof RECIPE_SORTS[number]['key'];
export const DEFAULT_RECIPE_SORT: RecipeSort = 'name';

/** Recipes in the chosen order (a new array). `all` is every recipe in stored order (for Newest), `makeable` the ids with every ingredient at home.
 *  A recipe with no time or calories goes last; every tie falls back to name, then id, so a tie never swaps places. */
export function sortRecipes(list: readonly Recipe[], sort: RecipeSort, all: readonly Recipe[], makeable: ReadonlySet<string>): Recipe[] {
  const byNameId = nameCmp<Recipe>(r => r.n, r => r.id);
  const asc = (v: (r: Recipe) => number | undefined) => (a: Recipe, b: Recipe) => {
    const x = v(a), y = v(b);
    return x === y ? byNameId(a, b) : x === undefined ? 1 : y === undefined ? -1 : x - y;
  };
  const at = sort === 'newest' ? new Map(all.map((r, i) => [r.id, i])) : new Map<string, number>();
  const by: Record<RecipeSort, (a: Recipe, b: Recipe) => number> = {
    name: byNameId,
    newest: (a, b) => (at.get(b.id) ?? -1) - (at.get(a.id) ?? -1) || byNameId(a, b),
    time: asc(r => r.minutes || undefined),
    kcal: asc(r => (typeof r.kcal === 'number' ? r.kcal : undefined)),
    canmake: (a, b) => Number(makeable.has(b.id)) - Number(makeable.has(a.id)) || byNameId(a, b),
  };
  return [...list].sort(by[sort]);
}

/* ---------- Order of the library (server `sort` value) ---------- */

/** The Library's sort choices. Relevance is the server's order: best match when words are typed, name order when not. */
export const LIBRARY_SORTS = [
  { key: 'relevance', label: 'Best match' },
  { key: 'name', label: 'Name A to Z' },
] as const satisfies readonly SortOption[];
export type LibrarySort = typeof LIBRARY_SORTS[number]['key'];
export const DEFAULT_LIBRARY_SORT: LibrarySort = 'relevance';

/** The line saying how the Library list is ordered right now. `q` is the raw search: the server ignores punctuation, so only a letter or digit counts as typed. */
export const librarySortedBy = (sort: LibrarySort, q: string): string => (sort === 'name' || !/[\p{L}\p{N}]/u.test(q) ? 'Sorted by name, A to Z' : 'Sorted by best match');
