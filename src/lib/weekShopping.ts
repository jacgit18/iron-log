import type { DietCfg, DietEntry, Grocery, GroceryMonth, Recipe } from '../types.ts';
import { effectivePlan } from './dailySnacks.js';
import { entriesOn } from './dietLog.js';
import { isEaten, type Plan } from './dietPlan.js';
import { missingParts, pantryStatus } from './recipePantry.js';

// Week to Shopping (brief week-shopping): which recipes on the board's week still need buying for, and which Shopping items a tap added.

/** The days of the shown week that can still need shopping: today and later. Last week and past days add nothing. */
export const shoppingDays = (week: readonly string[], today: string): string[] => week.filter(d => d >= today);

/** The recipe ids those days need from the shop, in plan order, each once. An item already eaten, a saved meal (it has no ingredient lines) and a removed recipe add none. */
export function shoppingRecipeIds(plan: Plan, days: readonly string[], recipes: readonly Pick<Recipe, 'id'>[], entries: DietEntry[]): string[] {
  const seen = new Set<string>();
  for (const d of days) {
    const eaten = entriesOn(entries, d);
    for (const it of plan[d] ?? []) if (it.k === 'r' && recipes.some(r => r.id === it.id) && !isEaten(it, eaten)) seen.add(it.id);
  }
  return [...seen];
}

/** The recipe ids Week to Shopping buys for: the plan as the board shows it, so the listed daily snacks count on the days they show (today to today + 13, not skipped that day, not already a real item there), each recipe once. The button's count and the store action both read this, so they cannot disagree. */
export const plannedShoppingIds = (diet: DietCfg | undefined, days: readonly string[], today: string, recipes: readonly Pick<Recipe, 'id'>[], entries: DietEntry[]): string[] =>
  shoppingRecipeIds(effectivePlan(diet, days, today), days, recipes, entries);

/** The ids in `after` that were not in `before`: the Shopping items one tap created, so Undo removes those and nothing else. */
export const idsAdded = (before: readonly { id: string }[], after: readonly { id: string }[]): string[] => {
  const had = new Set(before.map(x => x.id));
  return after.filter(x => !had.has(x.id)).map(x => x.id);
};

/** How many new Shopping items a tap would add for these recipes, each name once; 0 turns the button off. A recipe is checked against the list as it is now, so two recipes needing the same thing count it once. */
export function shoppingNeed(ids: readonly string[], recipes: readonly Recipe[], g: Grocery, month: GroceryMonth): number {
  const names = new Set<string>();
  for (const id of ids) {
    const r = recipes.find(x => x.id === id);
    if (r) for (const n of missingParts(pantryStatus(r, g, month, recipes)).add) names.add(n.trim().toLowerCase());
  }
  return names.size;
}
