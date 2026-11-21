import type { DietEntry, Grocery, GroceryItem, GroceryMonth, PlanItem, Recipe } from '../types.ts';
import { isEaten, type Resolved } from './dietPlan.js';
import { carryOver, haveOf, usedOneTime } from './grocery.js';
import { matchHome, pantryStatus } from './recipePantry.js';

/* ---------- At home mark on Nutrition board cards (brief grocery-stock-flag, ADR 140) ----------
   Pure read of the Groceries Inventory tick: nothing is stored, nothing is counted. A recipe with ingredient lines uses `pantryStatus` (the same
   answer as Recipes); a food with none is matched by its own name; a saved meal or a food that matches no item has no mark (never "out"). */

/** The board's and Foods' word for a food you do not have (owner 2026-11-21): the Inventory screen keeps "On Shopping" (`homeStateText`). */
export const NEED_TEXT = 'Need';
export const HAVE_TEXT = 'Have';
/** `Recipe.home` value for "Not tracked". */
export const NOT_TRACKED = '-';
const stateText = (have: boolean): string => (have ? HAVE_TEXT : NEED_TEXT);

export interface CardStock { kind: 'have' | 'shopping' | 'partial'; text: string }

/** What a day's marks are worked out against: the Inventory without one-time items already bought, and the current month as Groceries will see it. */
export interface StockContext { g: Grocery; month: GroceryMonth; recipes: readonly Recipe[] }

/** The current month with the last month's Have ticks applied when Groceries has not carried them yet (ADR 079: `carryGroceryTicks` writes them
 *  only once Groceries is opened, so on the 1st the board must read them the same way). Nothing is written. */
export function monthWithCarry(g: Grocery, months: Record<string, GroceryMonth>, key: string): GroceryMonth {
  const cur = months[key] ?? { lines: {}, pulled: [] };
  const carry = carryOver(g, months, key);
  if (!carry) return cur;
  const lines = { ...cur.lines };
  for (const id of carry.ids) lines[id] = { ...(lines[id] ?? {}), have: true };
  return { ...cur, lines };
}

/** The context for one day, or null when no card of that day can have a mark: a past day, another month than today's, or no Inventory items. */
export function stockContext(day: string, today: string, g: Grocery, months: Record<string, GroceryMonth>, recipes: readonly Recipe[]): StockContext | null {
  if (day < today || day.slice(0, 7) !== today.slice(0, 7) || !g.items.length) return null;
  const hidden = usedOneTime(g, months); // a one-time item already bought is not on Inventory
  const items = hidden.size ? g.items.filter(i => !hidden.has(i.id)) : g.items;
  if (!items.length) return null;
  return { g: items === g.items ? g : { ...g, items }, month: monthWithCarry(g, months, today.slice(0, 7)), recipes };
}

/** The At home item a food with no ingredient lines stands for: its pin first (a pin to an item that is gone is ignored, and `'-'` is Not tracked, so
 *  no item), else its own name. Null when none. */
export function foodItem(recipe: Pick<Recipe, 'n' | 'home'>, items: readonly GroceryItem[]): GroceryItem | null {
  if (recipe.home === NOT_TRACKED) return null;
  if (recipe.home) { const pinned = items.find(i => i.id === recipe.home); if (pinned) return pinned; }
  return matchHome({ n: recipe.n }, items as GroceryItem[]);
}

/** The mark for a ready-made food (no ingredient lines) from its item, or null when it has none. */
export function foodStock(recipe: Pick<Recipe, 'n' | 'home'>, ctx: StockContext): CardStock | null {
  const hit = foodItem(recipe, ctx.g.items);
  if (!hit) return null;
  const have = haveOf(hit, ctx.month);
  return { kind: have ? 'have' : 'shopping', text: stateText(have) };
}

/** The marks of the ready-made foods in a list (Foods, the Add food picker), by recipe id; foods with none are left out. Worked out against today. */
export function foodMarks(recipes: readonly Recipe[], today: string, g: Grocery, months: Record<string, GroceryMonth>): Map<string, CardStock> {
  const out = new Map<string, CardStock>();
  const ctx = stockContext(today, today, g, months, recipes);
  if (!ctx) return out;
  for (const r of recipes) {
    if (r.cat !== 'ready' || r.ing.length > 0) continue;
    const m = foodStock(r, ctx);
    if (m) out.set(r.id, m);
  }
  return out;
}

/** The mark for one card, or null when there is nothing to say: a saved meal, a removed card, an eaten card, or a food that matches nothing. */
export function cardStock(r: Pick<Resolved, 'gone' | 'recipe'>, eaten: boolean, ctx: StockContext): CardStock | null {
  const recipe = r.recipe;
  if (!recipe || r.gone || eaten) return null;
  if (recipe.ing.length > 0) {
    const s = pantryStatus(recipe, ctx.g, ctx.month, ctx.recipes);
    if (s.total === 0) return null;
    if (s.have === s.total) return { kind: 'have', text: stateText(true) };
    if (s.have === 0) return { kind: 'shopping', text: stateText(false) };
    return { kind: 'partial', text: `${s.have} of ${s.total} at home` };
  }
  return foodStock(recipe, ctx);
}

/** One day's marks, worked out once: the plan index of each card to its mark (cards with none are left out). */
export function dayStock(
  day: string, today: string, cards: readonly { r: Pick<Resolved, 'item' | 'gone' | 'recipe'>; index: number }[],
  diet: readonly Pick<DietEntry, 'id'>[], g: Grocery, months: Record<string, GroceryMonth>, recipes: readonly Recipe[],
): Map<number, CardStock> {
  const out = new Map<number, CardStock>();
  const ctx = stockContext(day, today, g, months, recipes);
  if (!ctx) return out;
  for (const c of cards) {
    const mark = cardStock(c.r, isEaten(c.r.item as PlanItem, diet), ctx);
    if (mark) out.set(c.index, mark);
  }
  return out;
}
