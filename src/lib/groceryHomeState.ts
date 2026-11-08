import type { GroceryItem } from '../types.ts';
import type { Chip } from './groceryChips.js';

// What an Inventory row says about itself (brief groceries-inventory-vs-shopping): a ticked item is one you have, an unticked one is on Shopping.
// The Need / Have / All chips filter on that tick. Pure; the page keeps the state.

export type HomeFilter = 'all' | 'need' | 'have';
type Has = (item: GroceryItem) => boolean;

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The pill on an Inventory row. */
export const homeStateText = (have: boolean): string => (have ? 'Have' : 'On Shopping');

/** "bought Nov" for an item ticked bought in the month `monthKey` (YYYY-MM); empty for a key that is not a month. */
export function boughtMonthText(monthKey: string): string {
  const m = /^\d{4}-(0[1-9]|1[0-2])$/.exec(monthKey);
  return m ? `bought ${SHORT_MONTHS[Number(m[1]) - 1]}` : '';
}

/** An Inventory store header's count: "1 to buy · 2 you have". */
export const toBuyText = (n: number, have: number): string => `${n - have} to buy · ${have} you have`;

/** The items a chip shows: every one for All, those you still need for Need, those you have for Have. */
export const homeFilterItems = (items: GroceryItem[], has: Has, filter: HomeFilter): GroceryItem[] => (filter === 'all' ? items : items.filter(i => has(i) === (filter === 'have')));

/** The chips, `All n`, `Need n`, `Have n`, counted over every item (the search does not change them). */
export function homeFilterChips(items: GroceryItem[], has: Has): Chip[] {
  const have = items.filter(has).length;
  return [{ key: 'all', label: 'All', count: items.length }, { key: 'need', label: 'Need', count: items.length - have }, { key: 'have', label: 'Have', count: have }];
}

/** The line under a filter that shows nothing. With a store chip on (`store`: its name) it says so, since other stores may still have rows. */
export const homeFilterEmpty = (filter: HomeFilter, store?: string): string =>
  filter === 'need' ? (store ? `Nothing to buy at ${store}. You have everything there.` : 'Nothing to buy. You have everything.') : (store ? `You have none of the ${store} items yet.` : 'You have none of these yet.');
