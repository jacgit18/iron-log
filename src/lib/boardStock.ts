import type { DietEntry, Grocery, GroceryMonth, PlanItem, Recipe } from '../types.ts';
import { isEaten, type Resolved } from './dietPlan.js';
import { usedOneTime } from './grocery.js';
import { homeStateText } from './groceryHomeState.js';
import { matchHome, pantryStatus } from './recipePantry.js';

/* ---------- At home mark on Nutrition board cards (brief grocery-stock-flag, ADR 140) ----------
   Pure read of the Groceries Inventory tick: nothing is stored, nothing is counted. A recipe with ingredient lines uses `pantryStatus` (the same
   answer as Recipes); a food with none is matched by its own name; a saved meal or a food that matches no item has no mark (never "out"). */

export interface CardStock { kind: 'have' | 'shopping' | 'partial'; text: string }

const EMPTY_MONTH: GroceryMonth = { lines: {}, pulled: [] };

/** The mark for one card, or null: nothing to say. Shown only for a card that is not removed or eaten, on a day from today on, in the current month. */
export function cardStock(
  r: Pick<Resolved, 'item' | 'gone' | 'recipe'>, day: string, today: string, eaten: boolean,
  g: Grocery, months: Record<string, GroceryMonth>, recipes: readonly Recipe[], hidden?: ReadonlySet<string>,
): CardStock | null {
  const recipe = r.recipe;
  if (!recipe || r.gone || eaten || day < today || day.slice(0, 7) !== today.slice(0, 7) || !g.items.length) return null;
  const items = hidden?.size ? g.items.filter(i => !hidden.has(i.id)) : g.items; // a one-time item already bought is not on Inventory
  if (!items.length) return null;
  const month = months[today.slice(0, 7)] ?? EMPTY_MONTH;
  const view: Grocery = items === g.items ? g : { ...g, items };
  if (recipe.ing.length > 0) {
    const s = pantryStatus(recipe, view, month, recipes);
    if (s.total === 0) return null;
    if (s.have === s.total) return { kind: 'have', text: homeStateText(true) };
    if (s.have === 0) return { kind: 'shopping', text: homeStateText(false) };
    return { kind: 'partial', text: `${s.have} of ${s.total} at home` };
  }
  const hit = matchHome({ n: recipe.n }, items);
  if (!hit) return null;
  const l = month.lines[hit.id];
  const have = l?.have === true || l?.got === true;
  return { kind: have ? 'have' : 'shopping', text: homeStateText(have) };
}

/** One day's marks, worked out once: the plan index of each card to its mark (cards with none are left out). */
export function dayStock(
  day: string, today: string, cards: readonly { r: Pick<Resolved, 'item' | 'gone' | 'recipe'>; index: number }[],
  diet: readonly Pick<DietEntry, 'id'>[], g: Grocery, months: Record<string, GroceryMonth>, recipes: readonly Recipe[],
): Map<number, CardStock> {
  const out = new Map<number, CardStock>();
  if (day < today || !g.items.length) return out;
  const hidden = usedOneTime(g, months);
  for (const c of cards) {
    const mark = cardStock(c.r, day, today, isEaten(c.r.item as PlanItem, diet), g, months, recipes, hidden);
    if (mark) out.set(c.index, mark);
  }
  return out;
}
