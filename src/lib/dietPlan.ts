import type { DailySnack, DietEntry, PlanItem, Recipe, SavedItem, SavedMeal } from '../types.ts';
import { withMicro } from '../shared/foodMicro.js';
import { MAX_DIET_PER_DAY, MAX_DAY_ITEMS, MAX_DAY_STORED, MAX_DAY_DRINKS, MAX_PLAN_AHEAD, MAX_PLAN_ITEMS, alreadyThereText, isDailySnackItem, isDrinkItem, plannedCount, samePlanItem } from '../shared/diet.js';
import { fmtNum, hasMacros, servingNumbers, shiftDay } from './dietLog.js';
import { planMeal } from './dietMeals.js';
import { mealItems } from './quickMeals.js';
import type { Food } from './foodMacros.js';
import { sortByName } from './sort.js';

/* ---------- The meal planner (brief diet-meal-planner): a day's list of recipes and saved meals, what it adds up to, what logging it does, what it needs from the shop. Pure; the store and the panel call these. ---------- */

export type Plan = Record<string, PlanItem[]>;
type Made = { plan: Plan; error: null } | { plan: null; error: string };
const fail = (error: string): Made => ({ plan: null, error });

/** `n` days from `start`, one after another. */
export const daysFrom = (start: string, n = 7): string[] => Array.from({ length: n }, (_, i) => shiftDay(start, i));

/** Whether `day` can be planned: today or up to MAX_PLAN_AHEAD days after it. */
export const inWindow = (day: string, today: string): boolean => day >= today && day <= shiftDay(today, MAX_PLAN_AHEAD);

/** The plan without days before `today` (earlier days are dropped when it is written). */
export const prunePlan = (plan: Plan, today: string): Plan => Object.fromEntries(Object.entries(plan).filter(([d]) => d >= today));

/** Why `list` (a day's stored items) can take no more of `item`, or null: the available list (not counting drinks and listed daily snacks) is held to MAX_DAY_ITEMS, the day to MAX_DAY_STORED, a drink to MAX_DAY_DRINKS, and an item marked planned (`p`) to MAX_PLAN_ITEMS planned things (a listed daily snack and a drink never count toward those; an item not marked planned is never held to them). */
export function fullReason(list: readonly PlanItem[], item: PlanItem, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): string | null {
  const full = `A day can hold ${MAX_DAY_ITEMS} things, not counting drinks and daily snacks. Remove one to add another.`;
  if (list.length >= MAX_DAY_STORED) return full;
  if (isDrinkItem(item, drinks)) return list.filter(i => isDrinkItem(i, drinks)).length >= MAX_DAY_DRINKS ? `A day can hold ${MAX_DAY_DRINKS} drinks. Remove one to add another.` : null;
  if (isDailySnackItem(item, snacks)) return null;
  if (list.filter(i => !isDailySnackItem(i, snacks) && !isDrinkItem(i, drinks)).length >= MAX_DAY_ITEMS) return full; // a ticked snack, a drink or a repeat of one is never refused for the list being full
  return item.p === true && plannedCount(list, snacks, drinks) >= MAX_PLAN_ITEMS ? PLANNED_FULL : null;
}

/** The refusal when a day already holds MAX_PLAN_ITEMS planned things (brief nutrition-board-available-list). */
export const PLANNED_FULL = `A day can hold ${MAX_PLAN_ITEMS} planned things. Unplan one to plan another.`;

/** Whether an item can be marked planned at all: never a listed daily snack or a drink. */
export const canBePlanned = (item: PlanItem, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): boolean => !isDailySnackItem(item, snacks) && !isDrinkItem(item, drinks);

/** The refusal for planning one more thing on a day, or null: the day already holds MAX_PLAN_ITEMS planned things. Asked before anything is stored, so a refused Plan leaves the tray as it was. */
export const planFullReason = (list: readonly PlanItem[], snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): string | null => (plannedCount(list, snacks, drinks) >= MAX_PLAN_ITEMS ? PLANNED_FULL : null);

/** `plan` with the item at `index` of `day` marked planned (`on`) or unmarked. Marking never changes what the day holds, only the planned count: an error text when the day already holds MAX_PLAN_ITEMS planned things, or for a listed daily snack or a drink (they never count as planned). Unchanged when the item is gone or already in that state. */
export function markPlanned(plan: Plan, day: string, index: number, on: boolean, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): Made {
  const list = plan[day] ?? [], it = list[index];
  if (!it) return fail('That is gone.');
  if ((it.p === true) === on) return { plan, error: null };
  if (on) {
    if (!canBePlanned(it, snacks, drinks)) return fail('Daily snacks and drinks are not counted as planned things.');
    if (plannedCount(list, snacks, drinks) >= MAX_PLAN_ITEMS) return fail(PLANNED_FULL);
  }
  const { p: _old, ...rest } = it;
  const next: PlanItem = on ? { ...rest, p: true } : rest;
  return { plan: { ...plan, [day]: list.map((x, i) => (i === index ? next : x)) }, error: null };
}

/** `plan` with `item` added to `day`. An error text outside the window, on a full day, or for an item already there. The available list holds MAX_DAY_ITEMS; only an item marked planned counts toward MAX_PLAN_ITEMS (a listed daily snack, `snacks` is the list, never does). */
export function addItem(plan: Plan, day: string, item: PlanItem, today: string, snacks?: readonly DailySnack[], drinks?: ReadonlySet<string>): Made {
  if (!inWindow(day, today)) return fail('You can plan today and the next 52 weeks.');
  const list = plan[day] ?? [];
  { const dup = list.find(i => samePlanItem(i, item)); if (dup) return fail(alreadyThereText()); } // the same food may be in two different meals
  const full = fullReason(list, item, snacks, drinks);
  if (full) return fail(full);
  return { plan: { ...plan, [day]: [...list, item] }, error: null };
}

/** `plan` with the item at `index` of `day` removed (an emptied day is dropped). */
export function removeItem(plan: Plan, day: string, index: number): Plan {
  const list = (plan[day] ?? []).filter((_, i) => i !== index);
  const { [day]: _gone, ...rest } = plan;
  return list.length ? { ...rest, [day]: list } : rest;
}

/** `plan` with the recipe at `index` of `day` set to `portion` (half steps, 0.5 to 10; 1 is stored as no `x`). Unchanged for a saved meal or a bad portion. */
export function setPortion(plan: Plan, day: string, index: number, portion: number): Plan {
  const it = plan[day]?.[index];
  if (!it || it.k !== 'r' || !(portion >= 0.5 && portion <= 10) || portion * 2 !== Math.round(portion * 2)) return plan;
  const next: PlanItem = { k: 'r', id: it.id, ...(portion === 1 ? {} : { x: portion }), ...(it.s ? { s: it.s } : {}), ...(it.e ? { e: it.e } : {}), ...(it.p ? { p: true as const } : {}) };
  return { ...plan, [day]: plan[day]!.map((x, i) => (i === index ? next : x)) };
}

/** `plan` with the item at `index` of `day` marked eaten by the log entries `ids` (none clears it). */
export function setEaten(plan: Plan, day: string, index: number, ids: string[]): Plan {
  const it = plan[day]?.[index];
  if (!it) return plan;
  const { e: _old, ...rest } = it;
  const next: PlanItem = ids.length ? { ...rest, e: ids } : rest;
  return { ...plan, [day]: plan[day]!.map((x, i) => (i === index ? next : x)) };
}

/** Whether a planned item counts as eaten: one of the entries its check added is still in the log. */
export const isEaten = (item: PlanItem, entries: readonly { id: string }[]): boolean => !!item.e?.some(id => entries.some(x => x.id === id));

/** A planned item looked up: its name, the numbers it carries, and whether the recipe or meal is gone. */
export interface Resolved { item: PlanItem; name: string; gone: boolean; kcal?: number; p?: number; c?: number; f?: number; portion: number; recipe?: Recipe; meal?: SavedMeal }

/** `meals` is the saved meals still held back from Recipes and `moved` the saved-meal id to recipe id record (brief saved-meals-removal): a saved-meal item shows the recipe it became, else the held meal, else the gone state. */
export function resolve(item: PlanItem, recipes: Recipe[], meals: SavedMeal[], moved: Readonly<Record<string, string>> = {}): Resolved {
  const portion = item.x ?? 1;
  if (item.k === 'm') {
    const to = moved[item.id];
    if (to) return { ...resolve({ k: 'r', id: to }, recipes, meals), item }; // the recipe it became, one portion; the item stays the plan's own so a tap still edits it
    const meal = meals.find(m => m.id === item.id);
    if (!meal) return { item, name: 'Removed', gone: true, portion: 1 };
    return { item, name: meal.n, gone: false, portion: 1, meal, kcal: meal.items.reduce((a, i) => a + i.kcal, 0), p: meal.items.reduce((a, i) => a + i.p, 0) };
  }
  const recipe = recipes.find(r => r.id === item.id);
  if (!recipe) return { item, name: 'Removed', gone: true, portion };
  const nums = hasMacros(recipe) ? servingNumbers(recipe, portion) : null;
  return { item, name: recipe.n, gone: false, portion, recipe, ...(nums ? { kcal: nums.kcal, p: nums.p } : {}) };
}

/** What a day's list adds up to: calories and protein, and how many items have no numbers (a recipe without them). Removed items count as nothing. */
export function dayTotals(items: PlanItem[], recipes: Recipe[], meals: SavedMeal[], moved: Readonly<Record<string, string>> = {}): { kcal: number; protein: number; without: number } {
  let kcal = 0, protein = 0, without = 0;
  for (const it of items) {
    const r = resolve(it, recipes, meals, moved);
    if (r.gone) continue;
    if (r.kcal === undefined || r.p === undefined) { without++; continue; }
    kcal += r.kcal; protein += r.p;
  }
  return { kcal, protein: Math.round(protein * 10) / 10, without };
}

/** "Planned 2,150 of 2,775 kcal · 120 of 150 g protein" (just the planned numbers with no target), then " · 1 without calories" when a recipe has none. */
export function totalsText(t: { kcal: number; protein: number; without: number }, kcalTarget: number | null, proteinTarget: number | null): string {
  const part = (have: number, target: number | null, unit: string) => `${fmtNum(have)}${target ? ` of ${fmtNum(target)}` : ''} ${unit}`;
  return `Planned ${part(t.kcal, kcalTarget, 'kcal')} · ${part(t.protein, proteinTarget, 'g protein')}${t.without ? ` · ${t.without} without calories` : ''}`;
}

/** What logging a planned item on `day` adds: the entries that fit under the per-day limit and how many did not; or why it cannot be logged. */
export function planLog(r: Resolved, entries: DietEntry[], day: string, recipes: readonly Recipe[] = []): { add: Food[]; left: number } | { error: string } {
  if (r.gone) return { error: 'That was removed. Remove it from the plan.' };
  if (r.meal) return planMeal(entries, day, r.meal);
  const parts = r.item.k === 'm' && r.recipe ? mealItems(r.recipe, recipes) : []; // a saved meal that moved logs one entry per food, as before
  if (parts.length) return planMeal(entries, day, { id: r.item.id, n: r.name, items: parts });
  const nums = r.recipe && hasMacros(r.recipe) ? servingNumbers(r.recipe, r.portion) : null;
  if (!r.recipe || !nums) return { error: 'Add calories and protein to this recipe to log it.' };
  const room = entries.filter(e => e.d === day).length < MAX_DIET_PER_DAY;
  return room ? { add: [{ n: r.recipe.n, kcal: nums.kcal, p: nums.p, ...(nums.c !== undefined ? { c: nums.c } : {}), ...(nums.f !== undefined ? { f: nums.f } : {}), from: r.recipe.id, ...withMicro(nums.micro), ...(nums.micro && r.recipe.est ? { est: true as const } : {}), x: r.portion }], left: 0 } : { add: [], left: 1 };
}

export const MAX_FIND_MATCHES = 8;

/** The recipes or meals whose name contains `query` (case-blind; empty matches all), A to Z, then capped: the cap keeps the first alphabetical ones, not the first stored. */
export function findMatches<T extends { id: string; n: string }>(list: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  return sortByName(list.filter(x => !needle || x.n.toLowerCase().includes(needle)), x => x.n, x => x.id).slice(0, MAX_FIND_MATCHES);
}
