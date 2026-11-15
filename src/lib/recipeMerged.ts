import type { CatalogItem, Recipe, RecipeCategory } from '../types.ts';
import { inMine } from './libraryRows.js';
import type { RecipeTab } from './recipeList.js';

/* ---------- Recipes as one list (brief recipes-mine-library-merge): your recipes, then the library recipes you do not have yet in their own box. One search, one filter. Pure; Recipes.tsx only draws it. ---------- */

/** The filter over the one list. */
export const SOURCES = [{ key: 'all', label: 'All' }, { key: 'mine', label: 'Mine' }, { key: 'library', label: 'Library' }] as const;
export type RecipeSource = typeof SOURCES[number]['key'];

export interface MergedGroups { mine: Recipe[]; library: CatalogItem[] }

/** Your recipes (as given, already searched, filtered and sorted) and the library items that are not yours yet: a library recipe with a copy in Mine is listed only under Mine. */
export function mergedGroups(mine: readonly Recipe[], allMine: readonly Recipe[], library: readonly CatalogItem[]): MergedGroups {
  return { mine: [...mine], library: library.filter(it => !inMine(it, allMine)) };
}

/** The numbers on the three filter buttons; `library` is null until the library has been loaded once (the app cannot know it without a request). */
export interface SourceCounts { all: number; mine: number; library: number | null; plus: boolean }

/** The counts match the rows shown: Library is the box's rows, All is both groups. `plus` is true while more library pages can be loaded, so the Library and All counts are "at least". */
export function sourceCounts(groups: MergedGroups, loaded: boolean, more: boolean): SourceCounts {
  const library = loaded ? groups.library.length : null;
  return { all: groups.mine.length + (library ?? 0), mine: groups.mine.length, library, plus: loaded && more };
}

/** A filter button's number as text: "12", "12+" or "" when unknown. */
export function countText(source: RecipeSource, c: SourceCounts): string {
  const n = c[source];
  if (n === null) return '';
  return source !== 'mine' && c.plus ? `${n}+` : String(n);
}

export interface BoxInput { source: RecipeSource; q: string; browse: boolean; tab: RecipeTab; recent: boolean; cat: RecipeCategory | null }

/** Whether the library box is on screen: not under Mine, not on a tab or category the library has nothing for (Foods, Ready-made) or under Recent; and with no search text only once "Browse the library" is open (or the Library filter is on). */
export function libraryBoxShown(i: BoxInput): boolean {
  if (i.source === 'mine' || i.recent || i.tab === 'foods' || i.cat === 'ready') return false;
  return i.source === 'library' || i.browse || i.q.trim() !== '';
}

/** Whether the "Your nutrition and tag filters do not apply here" line shows in the box. */
export const filtersSkipLibrary = (nutrition: readonly string[], tags: readonly string[]): boolean => nutrition.length > 0 || tags.length > 0;

/** Whether the "Your recipes (n)" heading shows: only while the library box is drawn under your recipes (it tells the two groups apart); with no box the Mine count is already on the filter. */
export const yourHeadingShown = (boxOn: boolean, yours: boolean, hasRecipes: boolean): boolean => boxOn && yours && hasRecipes;
