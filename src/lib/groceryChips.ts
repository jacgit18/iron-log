import type { GroceryItem } from '../types.ts';
import type { SortOption } from './sortChoice.js';

// Store chips on Shopping and the row-details default (brief groceries-store-chips-owes). Pure; the page keeps the state.

type Group = { store: string; label: string; items: GroceryItem[] };

export const ALL_CHIP = 'all';
export interface Chip { key: string; label: string; count: number }

/** The key of a store's chip (the store's name; '' is Anywhere), so it cannot be the key of All. */
export const storeChip = (store: string): string => `s:${store}`;

/** `All n` and one chip per store with rows still to get, in the order the stores are listed. */
export function chipsOf(groups: Group[]): Chip[] {
  const stores = groups.filter(grp => grp.items.length > 0).map(grp => ({ key: storeChip(grp.store), label: grp.label, count: grp.items.length }));
  return [{ key: ALL_CHIP, label: 'All', count: stores.reduce((n, c) => n + c.count, 0) }, ...stores];
}

/** The chip to show: the chosen one while its store still has rows, else All (a store whose last row was just ticked falls back). */
export const resolveChip = (chip: string, groups: Group[]): string => (chip !== ALL_CHIP && groups.some(grp => storeChip(grp.store) === chip && grp.items.length > 0) ? chip : ALL_CHIP);

/** The stores a chip shows: every one for All, else just its store. */
export const chipGroups = <T extends { store: string }>(groups: T[], chip: string): T[] => (chip === ALL_CHIP ? groups : groups.filter(grp => storeChip(grp.store) === chip));

/** Chips are offered only when there is more than one store to tell apart. */
export const showChips = (chips: Chip[]): boolean => chips.length > 2;

/** Chips up to this many options (All plus up to 3 stores) stay chips; more become one dropdown (brief filter-dropdowns, owner rule 2026-11-10: more than 4 options). */
export const CHIPS_MAX = 4;

/** Whether a chip set is shown as a dropdown: more than four options. */
export const asDropdown = (chips: Chip[]): boolean => chips.length > CHIPS_MAX;

/** The dropdown's option text: "All (12)" for All, "Costco (8)" for a store. */
export const chipOptionText = (c: Chip): string => `${c.label} (${c.count})`;

/** The select value of a chip key: All is '' (FilterSelect's All), a store keeps its key. */
export const chipToValue = (key: string): string => (key === ALL_CHIP ? '' : key);

/** The chip key of a select value: '' is All. */
export const valueToChip = (value: string): string => (value === '' ? ALL_CHIP : value);

/** The width (px) from which row details start open: above 700, the repo's phone breakpoint (as the Program editor and the Board). */
export const DETAILS_OPEN_FROM = 701;

export type DetailsChoice = 'auto' | 'open' | 'closed';
export const DETAILS_CHOICES: readonly SortOption<DetailsChoice>[] = [{ key: 'auto', label: 'By screen size' }, { key: 'open', label: 'Show details on all rows' }, { key: 'closed', label: 'Hide details on all rows' }];

/** Whether row details start open: a choice made in the More menu wins, else open from 700 px wide. */
export const detailsStartOpen = (choice: DetailsChoice, width: number): boolean => (choice === 'open' ? true : choice === 'closed' ? false : width >= DETAILS_OPEN_FROM);

/** A row with no price of its own (the "Add price" chip on a bought row). */
export const hasNoPrice = (line: { cents?: number | null; prices?: number[] }): boolean => line.cents == null && !line.prices;

/** How many of an Inventory store's items you have (the "m you have" in its header and the rail's "m of n"). */
export const haveCount = (items: GroceryItem[], has: (item: GroceryItem) => boolean): number => items.filter(has).length;

/** The Inventory rail's line: "2 of 5 items this month". */
export const haveMonthText = (have: number, n: number): string => `${have} of ${n} ${n === 1 ? 'item' : 'items'} this month`;
