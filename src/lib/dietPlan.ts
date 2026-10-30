import type { DietEntry, PlanItem, Recipe, SavedItem, SavedMeal } from '../types.ts';
import { MAX_DIET_PER_DAY, MAX_PLAN_AHEAD, MAX_PLAN_ITEMS } from '../shared/diet.js';
import { fmtNum, hasMacros, servingNumbers, shiftDay } from './dietLog.js';
import { planMeal } from './dietMeals.js';

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

/** `plan` with `item` added to `day`. An error text outside the window, on a full day, or for an item already there. */
export function addItem(plan: Plan, day: string, item: PlanItem, today: string): Made {
  if (!inWindow(day, today)) return fail('You can plan today and the next two weeks.');
  const list = plan[day] ?? [];
  if (list.some(i => i.k === item.k && i.id === item.id)) return fail('That is already on this day.');
  if (list.length >= MAX_PLAN_ITEMS) return fail(`A day can hold ${MAX_PLAN_ITEMS} things. Remove one to add another.`);
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
  const next: PlanItem = portion === 1 ? { k: 'r', id: it.id } : { k: 'r', id: it.id, x: portion };
  return { ...plan, [day]: plan[day]!.map((x, i) => (i === index ? next : x)) };
}

/** A planned item looked up: its name, the numbers it carries, and whether the recipe or meal is gone. */
export interface Resolved { item: PlanItem; name: string; gone: boolean; kcal?: number; p?: number; c?: number; f?: number; portion: number; recipe?: Recipe; meal?: SavedMeal }

export function resolve(item: PlanItem, recipes: Recipe[], meals: SavedMeal[]): Resolved {
  const portion = item.x ?? 1;
  if (item.k === 'm') {
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
export function dayTotals(items: PlanItem[], recipes: Recipe[], meals: SavedMeal[]): { kcal: number; protein: number; without: number } {
  let kcal = 0, protein = 0, without = 0;
  for (const it of items) {
    const r = resolve(it, recipes, meals);
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
export function planLog(r: Resolved, entries: DietEntry[], day: string): { add: (SavedItem)[]; left: number } | { error: string } {
  if (r.gone) return { error: 'That was removed. Remove it from the plan.' };
  if (r.meal) return planMeal(entries, day, r.meal);
  const nums = r.recipe && hasMacros(r.recipe) ? servingNumbers(r.recipe, r.portion) : null;
  if (!r.recipe || !nums) return { error: 'Add calories and protein to this recipe to log it.' };
  const room = entries.filter(e => e.d === day).length < MAX_DIET_PER_DAY;
  return room ? { add: [{ n: r.recipe.n, kcal: nums.kcal, p: nums.p, ...(nums.c !== undefined ? { c: nums.c } : {}), ...(nums.f !== undefined ? { f: nums.f } : {}), from: r.recipe.id }], left: 0 } : { add: [], left: 1 };
}

/** The recipe ids the days in `days` need from the shop, in order, each once; saved meals and removed recipes add none. */
export function recipeIdsFor(plan: Plan, days: string[], recipes: Recipe[]): string[] {
  const seen = new Set<string>();
  for (const d of days) for (const it of plan[d] ?? []) if (it.k === 'r' && recipes.some(r => r.id === it.id)) seen.add(it.id);
  return [...seen];
}
