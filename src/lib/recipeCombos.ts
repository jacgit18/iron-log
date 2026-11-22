import type { Recipe } from '../types.ts';
import { inTab, type RecipeTab, RECIPE_TABS } from './recipeList.js';
import { inSection, sectionsOf, type FoodSection } from './foodSections.js';
import { sortByName } from './sort.js';

/* ---------- Combos (brief recipes-combo-chips): a meal made only from your other items ("Cereal with Milk" from Cereal and Milk) shows as a chip on each part's row in Mine, not as a third row. Worked out from the data, never stored; every function here only reads. ---------- */

/** How many chips a row shows before "+N more". */
export const MAX_CHIPS = 2;

/** Whether `r` is a combo: it has at least one line and every line is a link to an item you still have (`rid`) with an amount (`q`). A typed ingredient, a sauce link without an amount or a link to a deleted item makes it a normal recipe. */
export function isCombo(r: Recipe, list: readonly Recipe[]): boolean {
  return isComboIn(r, new Set(list.map(o => o.id)));
}
const isComboIn = (r: Recipe, have: ReadonlySet<string>): boolean =>
  r.ing.length > 0 && r.ing.every(i => !!i.rid && i.rid !== r.id && typeof i.q === 'number' && have.has(i.rid));

/** The ids of every combo in `list`, worked out in one pass (the list view asks per row, so it asks this once). */
export function comboIds(list: readonly Recipe[]): Set<string> {
  const have = new Set(list.map(o => o.id));
  return new Set(list.filter(r => isComboIn(r, have)).map(r => r.id));
}

/** The items a combo is made from (each once), by name. Empty for a recipe that is not a combo. */
export function comboParts(combo: Recipe, list: readonly Recipe[], combos: ReadonlySet<string> = comboIds(list)): Recipe[] {
  if (!combos.has(combo.id)) return [];
  const ids = new Set(combo.ing.map(i => i.rid));
  return sortByName(list.filter(o => ids.has(o.id)), o => o.n, o => o.id);
}

/** "Cereal + Milk": the parts of a combo, named. */
export const partsLine = (combo: Recipe, list: readonly Recipe[], combos?: ReadonlySet<string>): string => comboParts(combo, list, combos).map(p => p.n).join(' + ');

/** The text of a chip on `part`'s row: "with Milk" when the combo is named "<part> with Milk", else the combo's own name. */
export function chipLabel(part: Pick<Recipe, 'n'>, combo: Pick<Recipe, 'n'>): string {
  const lead = `${part.n} with `;
  return combo.n.length > lead.length && combo.n.toLowerCase().startsWith(lead.toLowerCase()) ? `with ${combo.n.slice(lead.length)}` : combo.n;
}

export interface ComboChip { id: string; label: string; name: string }

/** What a row shows: the chips (name order), at most MAX_CHIPS unless `expanded`, and how many are beyond that cap (the "+N more" or "Show fewer" button exists when it is above 0). */
export function chipsShown(chips: readonly ComboChip[], expanded = false): { shown: ComboChip[]; more: number } {
  return { shown: expanded ? [...chips] : chips.slice(0, MAX_CHIPS), more: Math.max(0, chips.length - MAX_CHIPS) };
}

/** The rows whose chips stay expanded: a row keeps its place only while it still has chips beyond the cap, so a row that lost its "+N more" button (or is not shown) never comes back already expanded. */
export function expandedRows(ids: readonly string[], chips: ReadonlyMap<string, readonly ComboChip[]>): string[] {
  return ids.filter(id => (chips.get(id)?.length ?? 0) > MAX_CHIPS);
}

export interface MineRows {
  /** The rows to show, unsorted (the list's sort is applied after). */
  rows: Recipe[];
  /** For a row's id, the combos that chip onto it. Empty on the Meals tab, where the combos are rows. */
  chips: Map<string, ComboChip[]>;
}

/** The rows Mine shows in `tab`. `matched` is the recipes that pass the search and the filters (no tab yet), `all` every recipe.
 *  Meals lists every matching combo as its own row. Any other tab lists the matching non-combos of that tab; each combo is a chip on every part row shown, and
 *  only when none is does a matching combo of that tab become its own row (a search for "breakfast bowl", or a filter its parts do not pass), so it is never unreachable. */
export function mineRows(matched: readonly Recipe[], all: readonly Recipe[], tab: RecipeTab): MineRows {
  const chips = new Map<string, ComboChip[]>();
  const combo = comboIds(all);
  if (tab === 'meals') return { rows: matched.filter(r => combo.has(r.id) || inTab(r, 'meals')), chips };
  const rows = matched.filter(r => !combo.has(r.id) && inTab(r, tab));
  const shown = new Set(rows.map(r => r.id));
  const carried = new Set<string>();
  for (const c of sortByName(all.filter(r => combo.has(r.id)), r => r.n, r => r.id)) {
    for (const p of comboParts(c, all, combo)) {
      if (!shown.has(p.id)) continue;
      carried.add(c.id);
      chips.set(p.id, [...(chips.get(p.id) ?? []), { id: c.id, label: chipLabel(p, c), name: c.n }]);
    }
  }
  for (const r of matched) if (combo.has(r.id) && !carried.has(r.id) && inTab(r, tab)) rows.push(r);
  return { rows, chips };
}

/** How many rows each tab shows (the same rule as `mineRows`, so a count is never different from its tab). */
export function comboTabCounts(matched: readonly Recipe[], all: readonly Recipe[]): Record<RecipeTab, number> {
  const n = {} as Record<RecipeTab, number>;
  for (const t of RECIPE_TABS) n[t.key] = mineRows(matched, all, t.key).rows.length;
  return n;
}

/** The rows a Foods section shows (brief foods-made-and-store-bought): exactly your matching items that belong in it, so a pill's count is its rows. In Meals the combos are rows;
 *  in the other sections each combo (a meal with no steps made only from your items) is also a chip on the part rows shown there. A chip never hides a row. */
export function sectionRows(matched: readonly Recipe[], all: readonly Recipe[], section: FoodSection): MineRows {
  const rows = matched.filter(r => inSection(r, section));
  const chips = new Map<string, ComboChip[]>();
  if (section === 'meals' || section === 'library') return { rows, chips };
  const combo = comboIds(all);
  const shown = new Set(rows.map(r => r.id));
  for (const c of sortByName(all.filter(r => combo.has(r.id) && sectionsOf(r).includes('meals')), r => r.n, r => r.id)) {
    for (const p of comboParts(c, all, combo)) {
      if (shown.has(p.id)) chips.set(p.id, [...(chips.get(p.id) ?? []), { id: c.id, label: chipLabel(p, c), name: c.n }]);
    }
  }
  return { rows, chips };
}
