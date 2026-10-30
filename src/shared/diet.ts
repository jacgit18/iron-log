import type { DietCfg, DietEntry, PlanItem, SavedItem, SavedMeal } from '../types.ts';
import { addDays, parseDate, ymd } from './dates.js';
import { same } from './same.js';
import { str } from './stretchWeek.js';
import { validDate } from './validate.js';

/* ---------- Diet shapes: one thing you ate, and the targets you typed (ADR 086) ----------
   `normDietEntry` takes anything and returns the clean entry (or null when it can't be used); `validDietEntry` is stricter and says whether a
   value is already clean, for the API to refuse what the app would never send. Same split as recipes (src/shared/recipes.ts). */

export const MAX_DIET_PER_DAY = 20, RETAIN_DAYS = 400, MAX_DIET_ENTRIES = MAX_DIET_PER_DAY * RETAIN_DAYS;
export const MAX_DIET_ID = 60, MAX_DIET_NAME = 80;
export const MAX_KCAL = 9999, MAX_PROTEIN = 999;
/** The lowest target you can type: below this it is a slip, not a plan. */
export const MIN_TARGET_KCAL = 500, MIN_TARGET_PROTEIN = 10;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Calories as stored: a whole number from 1 to 9,999, or null. */
export const cleanKcal = (v: unknown): number | null => (fin(v) && Math.round(v) >= 1 && Math.round(v) <= MAX_KCAL ? Math.round(v) : null);
/** Protein in grams as stored: 0 to 999, one decimal, or null. */
export const cleanProtein = (v: unknown): number | null => (fin(v) && round1(v) >= 0 && round1(v) <= MAX_PROTEIN ? round1(v) : null);
/** Carbs or fat in grams as stored: the same range as protein (0 to 999, one decimal), or null. */
export const cleanGrams = cleanProtein;

export const MAX_MEALS = 30, MAX_MEAL_ITEMS = 10, MAX_MEAL_NAME = 40;

/** One food of a saved meal, cleaned: null without a name or numbers in range. */
export function normSavedItem(x: unknown): SavedItem | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const n = str(o.n, MAX_DIET_NAME), from = str(o.from, MAX_DIET_ID);
  const kcal = cleanKcal(o.kcal), p = cleanProtein(o.p);
  if (!n || kcal === null || p === null) return null;
  const c = o.c === undefined ? null : cleanGrams(o.c), f = o.f === undefined ? null : cleanGrams(o.f);
  return { n, kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}), ...(from ? { from } : {}) };
}

/** A name as compared: trimmed and case-blind, so "Breakfast" and "breakfast" are one meal. */
export const mealKey = (n: string): string => n.trim().toLowerCase();

/** The saved meals of a stored value, cleaned: unusable foods dropped, at most MAX_MEAL_ITEMS each, a meal with no food, a repeated id or a repeated name dropped, at most MAX_MEALS. */
export function normMeals(v: unknown): SavedMeal[] {
  const ids = new Set<string>(), names = new Set<string>(), out: SavedMeal[] = [];
  for (const raw of Array.isArray(v) ? v : []) {
    if (out.length >= MAX_MEALS) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const id = str(o.id, MAX_DIET_ID), n = str(o.n, MAX_MEAL_NAME);
    const items = (Array.isArray(o.items) ? o.items : []).map(normSavedItem).filter((i): i is SavedItem => i !== null).slice(0, MAX_MEAL_ITEMS);
    if (!id || !n || !items.length || ids.has(id) || names.has(mealKey(n))) continue;
    ids.add(id); names.add(mealKey(n)); out.push({ id, n, items });
  }
  return out;
}

export const MAX_PLAN_AHEAD = 13, MAX_PLAN_ITEMS = 8;

/** One planned item, cleaned: a recipe or meal kind, an id, and for a recipe a portion in half steps from 0.5 to 10 (left out when 1). */
export function normPlanItem(x: unknown): PlanItem | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, MAX_DIET_ID);
  if ((o.k !== 'r' && o.k !== 'm') || !id) return null;
  const x2 = o.x;
  const ok = o.k === 'r' && fin(x2) && x2 >= 0.5 && x2 <= 10 && x2 * 2 === Math.round(x2 * 2) && x2 !== 1;
  return { k: o.k, id, ...(ok ? { x: x2 as number } : {}) };
}

/** The plan of a stored value, cleaned: real dates only, at most MAX_PLAN_ITEMS a day, a repeated item dropped, an empty day dropped. With `today` the window is applied too: days before today and more than MAX_PLAN_AHEAD days after it are dropped. */
export function normPlan(v: unknown, today?: string): Record<string, PlanItem[]> {
  const out: Record<string, PlanItem[]> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const lo = today && validDate(today) ? today : null;
  const hi = lo ? ymd(addDays(parseDate(lo), MAX_PLAN_AHEAD)) : null;
  for (const d of Object.keys(v as object).sort()) {
    if (!validDate(d) || (lo && d < lo) || (hi && d > hi)) continue;
    const seen = new Set<string>(), items: PlanItem[] = [];
    for (const raw of Array.isArray((v as Record<string, unknown>)[d]) ? (v as Record<string, unknown[]>)[d]! : []) {
      const it = normPlanItem(raw);
      if (!it || seen.has(it.k + it.id) || items.length >= MAX_PLAN_ITEMS) continue;
      seen.add(it.k + it.id); items.push(it);
    }
    if (items.length) out[d] = items;
  }
  return out;
}

/** The hour of day an entry was added, as stored: a whole number from 0 to 23, or null. */
export const cleanHour = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : null);

/** One entry, cleaned. Null without an id, a real date, a name, or numbers in range. */
export function normDietEntry(x: unknown): DietEntry | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, MAX_DIET_ID), n = str(o.n, MAX_DIET_NAME), from = str(o.from, MAX_DIET_ID);
  const kcal = cleanKcal(o.kcal), p = cleanProtein(o.p);
  if (!id || !n || !validDate(o.d) || kcal === null || p === null) return null;
  const c = o.c === undefined ? null : cleanGrams(o.c), f = o.f === undefined ? null : cleanGrams(o.f); // optional: an unusable one is left out
  const t = cleanHour(o.t); // optional too
  return { id, d: o.d, n, kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}), ...(from ? { from } : {}), ...(t !== null ? { t } : {}) };
}

/** Whether `v` is an entry exactly as the app writes one. */
export const validDietEntry = (v: unknown): v is DietEntry => { const c = normDietEntry(v); return c !== null && same(c, v); };

/** Where an entry sits in the synced list: its day counted from 2020-01-01 (0 to 9999, the list's position limit), so deleting or pruning an entry never moves the rest. Entries of one day tie and are ordered by id. */
export function dietPosition(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.max(0, Math.min(9999, Math.round((Date.UTC(y!, m! - 1, day!) - Date.UTC(2020, 0, 1)) / 864e5)));
}

/** The entries of a stored list, cleaned: the unusable and repeated ones dropped, at most MAX_DIET_ENTRIES in all. The 20 a day limit is enforced when one is added, not here: two devices can both log to one day, and reading must not drop what was synced. */
export function normDietEntries(items: unknown): DietEntry[] {
  const seen = new Set<string>();
  const out: DietEntry[] = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const e = normDietEntry(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id); out.push(e);
    if (out.length >= MAX_DIET_ENTRIES) break;
  }
  return out;
}

/** Why a typed target can't be saved, or null. `value` null means cleared. */
export type TargetKey = 'kcal' | 'protein' | 'carbs' | 'fat';
const TARGET_NAME: Record<TargetKey, string> = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
export function targetError(key: TargetKey, value: number | null): string | null {
  if (value === null) return null;
  const min = key === 'kcal' ? MIN_TARGET_KCAL : MIN_TARGET_PROTEIN, max = key === 'kcal' ? MAX_KCAL : MAX_PROTEIN;
  return Number.isFinite(value) && Math.round(value) >= min && Math.round(value) <= max ? null : `${TARGET_NAME[key]} must be ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`;
}

export const MIN_RATE = 0.1, MAX_RATE = 3; // lb a week you may type for Custom (the app holds you to its own limit when it works out the calories)
export const rateError = (v: number | null): string | null => (v !== null && Number.isFinite(v) && v >= MIN_RATE && v <= MAX_RATE ? null : `Pace must be ${MIN_RATE} to ${MAX_RATE} lb a week.`);

/** The targets you typed and your pace pick (`cfg.diet`): only the keys that are in range survive; undefined when none do. */
export function normDietCfg(v: unknown, today?: string): DietCfg | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: DietCfg = {};
  (['kcal', 'protein', 'carbs', 'fat'] as const).forEach(k => { const v = o[k]; if (fin(v) && targetError(k, v) === null) out[k] = Math.round(v); });
  if (o.pace === 'slow' || o.pace === 'steady' || o.pace === 'fast') out.pace = o.pace;
  else if (o.pace === 'custom' && fin(o.rate) && rateError(o.rate) === null) { out.pace = 'custom'; out.rate = Math.round(o.rate * 100) / 100; }
  const meals = normMeals(o.meals);
  if (meals.length) out.meals = meals;
  const plan = normPlan(o.plan, today);
  if (Object.keys(plan).length) out.plan = plan;
  return Object.keys(out).length ? out : undefined;
}
