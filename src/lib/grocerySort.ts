import type { GroceryItem } from '../types.ts';
import { nameCmp } from './sort.js';
import type { SortOption } from './sortChoice.js';

// Display-only sort and search for the grocery lists. Nothing here changes the stored list, an id, a tick or what syncs: it returns new arrays
// of the same item objects. Every order ends in name, then id (lib/sort.ts), so a tie never swaps places between renders.

/** To get's sort choices. The first is the default. Ticked rows already sit last in each store there, so it has no "Not ticked first". */
export const GET_SORTS = [
  { key: 'name', label: 'Name A to Z' },
  { key: 'price', label: 'Price, high to low' },
] as const satisfies readonly SortOption[];
/** At home's sort choices. "Not ticked first" puts what you do not have yet before what you do. */
export const HOME_SORTS = [
  ...GET_SORTS,
  { key: 'open', label: 'Not ticked first' },
] as const satisfies readonly SortOption[];
export type GrocerySort = typeof HOME_SORTS[number]['key'];
export const DEFAULT_GROCERY_SORT: GrocerySort = 'name';

/** What a row is judged by: its cost in cents (null when it has no price) and whether it is ticked. */
export interface SortFacts { cents: (item: GroceryItem) => number | null; ticked: (item: GroceryItem) => boolean }

/** The items in the chosen order (a new array). Price puts the dearest first and unpriced rows last; Not ticked first keeps name order inside each half. */
export function sortGroceryItems(items: readonly GroceryItem[], sort: GrocerySort, facts: SortFacts): GroceryItem[] {
  const byName = nameCmp<GroceryItem>(i => i.n, i => i.id);
  const out = [...items];
  if (sort === 'price') {
    return out.sort((a, b) => {
      const x = facts.cents(a); const y = facts.cents(b);
      if (x == null || y == null) return x == null && y == null ? byName(a, b) : x == null ? 1 : -1;
      return y - x || byName(a, b);
    });
  }
  if (sort === 'open') return out.sort((a, b) => Number(facts.ticked(a)) - Number(facts.ticked(b)) || byName(a, b));
  return out.sort(byName);
}

/** Text for matching: lower case, accents removed, so "cafe" finds "Café". */
export const foldText = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The items whose name contains the typed text (case and accents ignored); an empty or blank search keeps every item. The order is kept. */
export function filterGroceryItems<T extends { n: string }>(items: readonly T[], query: string): T[] {
  const needle = foldText(query.trim());
  return needle ? items.filter(i => foldText(i.n).includes(needle)) : [...items];
}
