import type { DietEntry, Recipe } from '../types.ts';
import { cleanGrams, cleanKcal, cleanProtein, MAX_KCAL } from '../shared/diet.js';
import { scaleMicro, withMicro } from '../shared/foodMicro.js';
import type { Micro } from '../shared/foodMicro.js';
import { liveRows, microOfRows, rowsFromMicro } from './foodAmountRows.js';
import type { AmountRow } from './foodAmountRows.js';

/* ---------- Per-portion basis of an eaten item (brief portion-scaled-micros, ADR 123) ----------
   An entry stores its totals (what the day adds up) and, since this brief, the portion `x` they were logged at. The eaten-row Edit sheet shows ONE portion's numbers and a live total:
   changing the portion rescales calories, macros and amounts together; changing per-portion calories without retyping amounts still drops them (the sheet's calorie rule). Pure, so the rules have unit tests. */

export const PORTION_MIN = 0.5, PORTION_STEP = 0.5, PORTION_CEIL = 10;

/** One portion's numbers, exact (not rounded for display). */
export interface PerPortion { kcal: number; p: number; c?: number; f?: number; micro?: Micro }
/** What the sheet starts from: the portion, whether it was recorded (false for an entry logged before this change: it opens as 1 portion of its logged numbers), and one portion's numbers. */
export interface PortionBasis { x: number; recorded: boolean; per: PerPortion; /** One portion's amounts unrounded (`per.micro` is rounded to 3 decimals, as the rows show it): what a save with the rows untouched scales, so 100 over 3 portions comes back as 100. */ microExact?: Micro }
/** An entry's numbers at some portion count, ready for `updateDietEntry`. */
export interface PortionTotals { kcal: number; p: number; c: number | null; f: number | null; micro: Micro | null }

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The basis of an eaten entry: its stored portion (or 1 when none was recorded) and its totals divided by it. */
export function portionBasis(e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>): PortionBasis {
  const recorded = e.x !== undefined && e.x > 0, x = recorded ? e.x! : 1;
  const micro = scaleMicro(e.micro, 1 / x);
  const microExact = e.micro && micro ? Object.fromEntries(Object.keys(micro).map(k => [k, (e.micro as Record<string, number>)[k]! / x])) as Micro : undefined;
  return { x, recorded, ...(microExact ? { microExact } : {}), per: { kcal: e.kcal / x, p: e.p / x, ...(e.c !== undefined ? { c: e.c / x } : {}), ...(e.f !== undefined ? { f: e.f / x } : {}), ...withMicro(micro) } };
}

/** The text a per-portion box starts with: calories whole, grams to one decimal. */
export const shownPer = (per: PerPortion) => ({ kcal: String(Math.round(per.kcal)), p: String(round1(per.p)), c: per.c === undefined ? '' : String(round1(per.c)), f: per.f === undefined ? '' : String(round1(per.f)) });
export type PerText = ReturnType<typeof shownPer>;

const num = (t: string) => (t.trim() === '' ? NaN : Number(t));

/** The per-portion numbers to scale: a box left as it was shown keeps the exact number (so 520 kcal over 1.5 portions does not drift by rounding); a box that was typed in uses what was typed. Carbs and fat blank mean none. */
export function resolvePer(typed: PerText, shown: PerText, exact: PerPortion): { kcal: number; p: number; c: number | null; f: number | null } {
  const pick = (k: keyof PerText, ex: number | undefined) => (typed[k] === shown[k] && ex !== undefined ? ex : typed[k].trim() === '' ? null : num(typed[k]));
  return { kcal: pick('kcal', exact.kcal) ?? NaN, p: pick('p', exact.p) ?? NaN, c: pick('c', exact.c), f: pick('f', exact.f) };
}

/** The entry numbers for `per` eaten `x` times (one cleaner for each, so the stored totals are always valid), or null when a total is out of range. Amounts over a cap are dropped by `scaleMicro`. */
export function totalsAt(per: { kcal: number; p: number; c: number | null; f: number | null; micro?: Micro | null }, x: number): PortionTotals | null {
  if (!(x > 0)) return null;
  const exact = per.kcal * x, kcal = cleanKcal(exact > MAX_KCAL && exact < MAX_KCAL + 1 - 1e-6 ? MAX_KCAL : exact), p = cleanProtein(per.p * x); // under 1 kcal over the cap is the cap (Less then More from 9,999 rounds to 9,999.5), so the Edit sheet's `portionMaxFor` and the row's More agree; 10,000 or more is still out
  const c = per.c === null ? null : cleanGrams(per.c * x), f = per.f === null ? null : cleanGrams(per.f * x);
  if (kcal === null || p === null || (per.c !== null && c === null) || (per.f !== null && f === null)) return null;
  return { kcal, p, c, f, micro: scaleMicro(per.micro ?? undefined, x) ?? null };
}

/** The most portions the stepper offers for these per-portion numbers: PORTION_CEIL, lowered in half steps until the totals still fit one entry (like `ateMax`). */
export function portionMaxFor(per: { kcal: number; p: number; c: number | null; f: number | null }): number {
  let top = PORTION_CEIL;
  if (!(per.kcal > 0) || !Number.isFinite(per.p)) return top;
  while (top > PORTION_MIN && totalsAt(per, top) === null) top -= PORTION_STEP;
  return top;
}

/** The portion count one step from `x`, kept in range. */
export const stepPortionCount = (x: number, dir: 1 | -1, max: number): number => Math.min(max, Math.max(PORTION_MIN, Math.round((x + dir * PORTION_STEP) * 100) / 100));

/** A count as it is stored: two decimals, what `cleanPortion` (src/shared/diet.ts) accepts, so the totals are scaled by exactly what is kept. */
export const roundPortion = (x: number): number => Math.round(x * 100) / 100;

/** The numbers of an eaten entry at `x` portions, scaled from its one-portion basis (never the recipe: editing a recipe later does not rewrite what was eaten), with the count as stored; null when out of range.
 *  Out of range: below 0.5, above `max` (default PORTION_CEIL; a caller passes a food's own lower limit), a total over a cap, or a micronutrient amount that would be dropped for going over its cap (refused rather than losing data).
 *  A count at or below the entry's own is never held to `max`, so an entry above a lowered limit can still come down (Less). Calories land on 9,999 when the exact scale is under 1 kcal over it (Less then More from the cap rounds to 9,999.5: that is the cap, not a refusal); 10,000 or more is refused. */
export function entryTotalsAt(e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>, x: number, max = PORTION_CEIL): (PortionTotals & { x: number }) | null {
  if (!Number.isFinite(x)) return null;
  const b = portionBasis(e);
  x = roundPortion(x);
  if (x < PORTION_MIN || (x > b.x && x > Math.min(max, PORTION_CEIL))) return null;
  const t = totalsAt({ kcal: b.per.kcal, p: b.per.p, c: b.per.c ?? null, f: b.per.f ?? null, micro: b.microExact ?? null }, x);
  if (!t || Object.keys(e.micro ?? {}).length > Object.keys(t.micro ?? {}).length) return null;
  return { ...t, x };
}

/** The count one step (half a portion) from the entry's own, or null when there is no step: Less stops at 0.5 (and is never held to `max`), More stops at `max` (default PORTION_CEIL) or where the totals stop fitting. */
export function stepEntryCount(e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>, dir: 1 | -1, max = PORTION_CEIL): number | null {
  const cur = portionBasis(e).x, next = stepPortionCount(cur, dir, dir === -1 ? cur : Math.min(max, PORTION_CEIL));
  return (dir === 1 ? next > cur : next < cur) && entryTotalsAt(e, next, max) ? next : null;
}

/** "You ate 2.5 portions" / "You ate 1 portion". */
export const portionWords = (x: number): string => `${x} ${x === 1 ? 'portion' : 'portions'}`;

/** One portion's amounts as the sheet saves them, and the rows it draws. The calorie rule: when the per-portion calories no longer match the ones the kept rows came with, the untouched kept rows go (`cleared`); a row typed here stays;
 *  changing the portion never touches them. Rows left exactly as they were shown keep the exact per-portion amounts, so opening and saving with no edit cannot drift by the 3-decimal rounding (100 over 3 portions is 33.333, and 33.333 x 3 is 99.999). */
export function portionAmounts(rows: AmountRow[], kcalText: string, basis: PortionBasis): { rows: AmountRow[]; cleared: boolean; microPer: Micro | null } {
  const live = liveRows(rows, num(kcalText), Math.round(basis.per.kcal));
  const shown = rowsFromMicro(basis.per.micro, true);
  const same = live.rows.length === shown.length && live.rows.every((r, i) => r.key === shown[i]!.key && r.amount === shown[i]!.amount && r.unit === shown[i]!.unit);
  return { ...live, microPer: same ? basis.microExact ?? null : microOfRows(live.rows).micro ?? null };
}

/** Whether the sheet offers "also save to the recipe": the entry's linked recipe exists and has no amounts (never overwrites), and the portion was recorded. Without a recorded portion the sheet's "one portion" is a guess (a planned item at 2 portions, logged before `x` was stored, opens as 1), so per-serving amounts written to the recipe could be doubled. */
export const canSaveToRecipe = (recipe: Pick<Recipe, 'micro'> | undefined, recorded = true): boolean => recipeSaveBlock(recipe, recorded) === null;

/** Why the amounts cannot go to the recipe, in the words the sheet shows after a save, or null when they can: the recipe is gone (deleted, or removed on another device), the portion was not recorded, or it has amounts (never overwritten). */
export const recipeSaveBlock = (recipe: Pick<Recipe, 'micro'> | undefined, recorded = true): string | null =>
  recipe === undefined ? 'That recipe is gone.' : !recorded ? 'The portion was not recorded.' : recipe.micro && Object.keys(recipe.micro).length ? 'That recipe already has amounts.' : null;

/** What the sheet saves, from what is typed: totals at `x` (null total = out of range), one portion's amounts for the optional recipe save. `microPer` is one portion's typed or kept amounts (null for none). */
export function portionValues(i: { shown: PerText; typed: PerText; exact: PerPortion; x: number; microPer: Micro | null }): { totals: PortionTotals | null; per: { kcal: number; p: number; c: number | null; f: number | null }; microPer: Micro | null } {
  const per = resolvePer(i.typed, i.shown, i.exact);
  return { totals: totalsAt({ ...per, micro: i.microPer }, i.x), per, microPer: i.microPer };
}
