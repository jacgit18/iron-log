import type { GroceryItem } from '../types.ts';
import type { GroceryForm } from '../store/types.ts';

// Quick add on Shopping (brief groceries-spending-buttons-quick-add): a `+ Add item to <store>` row at the end of a store's list adds a one-time item (a When-out
// item that is out) from just a name. The store's add-item rules (duplicate name, full list, name length) do the checking; these are the pure parts around it.

/** The name as the store keeps it: trimmed, spaces collapsed, at most 80 characters (the same cleaning as `addGroceryItem`). */
export const cleanQuickName = (name: string): string => name.trim().replace(/\s+/g, ' ').slice(0, 80);

/** What the add-item rules are given: the name in that store, a count of 1, no price, and `oneTime` so it is created as a When-out item that is out. */
export const quickAddForm = (name: string, store: string): GroceryForm => ({ n: name, store, qty: '1', price: '', every: false, oneTime: true });

/** The row that was just added: the item with that name (any capitals) in that store, or undefined when the rules refused it. */
export const findQuickAdded = (items: readonly GroceryItem[], name: string, store: string): GroceryItem | undefined => {
  const n = cleanQuickName(name).toLowerCase();
  return items.find(i => i.store === store && i.n.toLowerCase() === n);
};

/** The label of the row at the end of a store's list. Items with no store are under Anywhere. */
export const quickAddLabel = (label: string): string => `Add item to ${label}`;

/** The notice after a quick add: what was added and where, then what it is. `every`: Make it every month was pressed. */
export const quickAddNotice = (name: string, label: string, every: boolean): string =>
  every ? `${name} is now an every-month item in ${label}.` : `Added ${name} to ${label}. It is a one-time item and stays in Inventory.`;
