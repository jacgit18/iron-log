import type { DietEntry, Recipe } from '../types.ts';
import { entriesOn } from './dietLog.js';
import { isEaten, type Plan } from './dietPlan.js';

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

/** The ids in `after` that were not in `before`: the Shopping items one tap created, so Undo removes those and nothing else. */
export const idsAdded = (before: readonly { id: string }[], after: readonly { id: string }[]): string[] => {
  const had = new Set(before.map(x => x.id));
  return after.filter(x => !had.has(x.id)).map(x => x.id);
};
