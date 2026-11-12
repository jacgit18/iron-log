import type { DietEntry, Recipe } from '../types.ts';
import { fmtNum, macroLine } from './macroLine.js';
import { MAX_DIET_PER_DAY, RETAIN_DAYS, cleanGrams, cleanKcal, cleanProtein } from '../shared/diet.js';
import { parseDate, ymd } from '../shared/dates.js';
import { scaleMicro, withMicro } from '../shared/foodMicro.js';
import type { Micro } from '../shared/foodMicro.js';

/* ---------- Food log helpers (ADR 086): what a day adds up to, what is offered again, what is kept. Pure; the store and the view call these. ---------- */

/** A day's entries by hour added (`t`), then the order they were added; an entry with no hour (a past day) follows the timed ones. A stable sort, so ties keep insertion order. */
export const entriesOn = (entries: DietEntry[], day: string): DietEntry[] =>
  entries.filter(e => e.d === day).sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || 0);

export interface Totals { kcal: number; protein: number; carbs: number; fat: number; count: number }
const sum1 = (n: number) => Math.round(n * 10) / 10;
export function totalsFor(entries: DietEntry[], day: string): Totals {
  const on = entriesOn(entries, day);
  return { kcal: on.reduce((a, e) => a + e.kcal, 0), protein: sum1(on.reduce((a, e) => a + e.p, 0)), carbs: sum1(on.reduce((a, e) => a + (e.c ?? 0), 0)), fat: sum1(on.reduce((a, e) => a + (e.f ?? 0), 0)), count: on.length };
}

/** Whether any entry of the day has no carbs or fat entered (so those two totals are only what was entered). */
export const missingCarbsFat = (entries: DietEntry[], day: string): boolean => entriesOn(entries, day).some(e => e.c === undefined || e.f === undefined);

/** Whether another entry fits on that day. */
export const roomOn = (entries: DietEntry[], day: string): boolean => entriesOn(entries, day).length < MAX_DIET_PER_DAY;

/** A day moved by whole days ("2026-10-29", -1 is "2026-10-28"). */
export function shiftDay(day: string, delta: number): string {
  const d = parseDate(day); d.setDate(d.getDate() + delta); return ymd(d);
}

/** The oldest day that is kept: RETAIN_DAYS before `today`. */
export const oldestDay = (today: string): string => shiftDay(today, -RETAIN_DAYS);

/** Why a food can't be logged to `day` from the recipe page (the log control on a chosen day), or null: a real date, not after `today`, not before the oldest kept day. */
export function ateDayError(day: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || ymd(parseDate(day)) !== day) return 'Pick a day.';
  if (day > today) return 'Pick today or an earlier day.';
  if (day < oldestDay(today)) return `Entries are kept for ${RETAIN_DAYS} days, so that day is too far back.`;
  return null;
}

/** The entries kept: those within RETAIN_DAYS of `today`. */
export function pruned(entries: DietEntry[], today: string): DietEntry[] {
  const cutoff = oldestDay(today);
  return entries.filter(e => e.d >= cutoff);
}

/** Whether a recipe has the numbers needed to log it. */
export const hasMacros = (r: Pick<Recipe, 'kcal' | 'p'>): boolean => r.kcal !== undefined && r.p !== undefined;

/** The numbers for eating `servings` of a recipe (a snapshot: later edits to the recipe never change them), or null without calories and protein or out of range. Carbs and fat come along when the recipe has them. */
export function servingNumbers(r: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f' | 'micro'>, servings: number): { kcal: number; p: number; c?: number; f?: number; micro?: Micro } | null {
  if (!hasMacros(r) || !(servings > 0)) return null;
  const kcal = cleanKcal(r.kcal! * servings), p = cleanProtein(r.p! * servings);
  if (kcal === null || p === null) return null;
  const c = r.c === undefined ? null : cleanGrams(r.c * servings), f = r.f === undefined ? null : cleanGrams(r.f * servings);
  return { kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}), ...withMicro(scaleMicro(r.micro, servings)) };
}

/** What the log control and the portion sheet log for `servings` of a recipe on `day` (brief nutrition-quick-log: one function, so the two ways can't drift), or the sentence to show. */
export function ateEntry(r: Pick<Recipe, 'id' | 'n' | 'kcal' | 'p' | 'c' | 'f' | 'micro'>, servings: number, day: string, today: string): { entry: Omit<DietEntry, 'id'> } | { error: string } {
  const nums = servingNumbers(r, servings);
  if (!nums) return { error: 'Those numbers are out of range.' };
  const bad = ateDayError(day, today);
  if (bad) return { error: bad };
  return { entry: { d: day, n: r.n, kcal: nums.kcal, p: nums.p, ...(nums.c !== undefined ? { c: nums.c } : {}), ...(nums.f !== undefined ? { f: nums.f } : {}), from: r.id, ...withMicro(nums.micro) } };
}

/** The entry to add for a food on `day`: its numbers, the recipe it came from, and its vitamins and minerals when it has them (one place, so a copied or re-logged food keeps them). */
export const entryFromFood = (d: string, f: { n: string; kcal: number; p: number; c?: number; f?: number; from?: string; micro?: Micro }): Omit<DietEntry, 'id'> =>
  ({ d, n: f.n, kcal: f.kcal, p: f.p, ...(f.c !== undefined ? { c: f.c } : {}), ...(f.f !== undefined ? { f: f.f } : {}), ...(f.from ? { from: f.from } : {}), ...withMicro(f.micro) });

/** The most portions the log control, the planner and Find food offer. */
export const PORTION_MAX = 10;

/** Servings in the pack of a ready-made food (brief whole-pack): 2 to 99, or null for a food with no pack size, a pack of 1, or any other recipe. */
export const packServings = (r: Pick<Recipe, 'cat' | 'servings'>): number | null => (r.cat === 'ready' && r.servings !== undefined && r.servings >= 2 ? r.servings : null);

/** The top of the log control's portion stepper: PORTION_MAX, or the pack size (ready-made foods) or usual amount (any recipe) when that is larger (up to 99), lowered in half steps until the totals still fit one entry
 * (calories and protein have caps in shared/diet.ts), so More and Whole pack never reach a number the log control would refuse. */
export function ateMax(r: Pick<Recipe, 'cat' | 'servings' | 'kcal' | 'p' | 'c' | 'f' | 'usual'>): number {
  let top = Math.min(99, Math.max(PORTION_MAX, packServings(r) ?? 0, r.usual ?? 0)); // a usual amount over 10 (brief usual-amount-and-unit) can be reached too
  if (!hasMacros(r)) return top;
  while (top > 0.5 && servingNumbers(r, top) === null) top -= 0.5;
  return top;
}

/** One entry in words, in the shared macro line (`macroLine`): "520 kcal · P 42 g", or "520 kcal · P 42 · C 60 · F 12 g" when carbs and fat were entered. */
export const entryText = (e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f'>): string => macroLine(e);

/** How full a bar is, 0 to 100 (the bar stops at full; the text says how far over). */
export const barPercent = (have: number, target: number | null): number => (target && target > 0 ? Math.max(0, Math.min(100, Math.round((have / target) * 100))) : 0);

/** "1,850 of 2,775" style numbers (lives in macroLine.ts; exported here as before, so callers do not change). */
export { fmtNum };

/** A meter's words: "1,850 of 2,775 kcal", with ", 225 over" past the target, or just "1,850 kcal" with no target. */
export function meterText(have: number, target: number | null, unit: string): string {
  if (!target) return `${fmtNum(have)} ${unit}`;
  const over = have - target;
  return `${fmtNum(have)} of ${fmtNum(target)} ${unit}${over > 0 ? `, ${fmtNum(Math.round(over * 10) / 10)} over` : ''}`;
}
