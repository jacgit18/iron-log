import type { GroceryItem, GroceryMonth } from '../types.ts';
import { lineOf } from './grocery.js';

// The Bought view (brief groceries-shopping-bought-inventory): what is ticked bought in a month, and which rows "Select all" takes.
// Pure; the page keeps the state (what is picked, which month).

export const boughtRows = (list: GroceryItem[], m: GroceryMonth): GroceryItem[] => list.filter(i => lineOf(i, m).got);


type Group = { store: string; items: GroceryItem[] };

/** Every row shown, for "Select all". */
export const allIds = (groups: Group[]): string[] => groups.flatMap(grp => grp.items.map(i => i.id));

/** The rows of one store, for "Select all in <store>". */
export const storeIds = (groups: Group[], store: string): string[] => groups.find(grp => grp.store === store)?.items.map(i => i.id) ?? [];

/** Whether every one of `ids` is picked: the button then reads as "Clear" instead of "Select all". An empty list is not all picked. */
export const allPicked = (ids: string[], picked: ReadonlySet<string>): boolean => ids.length > 0 && ids.every(id => picked.has(id));
