import type { DietEntry, Recipe } from '../types.ts';
import { cleanGrams, cleanKcal, cleanProtein } from '../shared/diet.js';
import { scaleMicro, withMicro } from '../shared/foodMicro.js';
import type { Micro } from '../shared/foodMicro.js';

/* ---------- Per-portion basis of an eaten item (brief portion-scaled-micros, ADR 123) ----------
   An entry stores its totals (what the day adds up) and, since this brief, the portion `x` they were logged at. The eaten-row Edit sheet shows ONE portion's numbers and a live total:
   changing the portion rescales calories, macros and amounts together; changing per-portion calories without retyping amounts still drops them (the sheet's calorie rule). Pure, so the rules have unit tests. */

export const PORTION_MIN = 0.5, PORTION_STEP = 0.5, PORTION_CEIL = 10;

/** One portion's numbers, exact (not rounded for display). */
export interface PerPortion { kcal: number; p: number; c?: number; f?: number; micro?: Micro }
/** What the sheet starts from: the portion, whether it was recorded (false for an entry logged before this change: it opens as 1 portion of its logged numbers), and one portion's numbers. */
export interface PortionBasis { x: number; recorded: boolean; per: PerPortion }
/** An entry's numbers at some portion count, ready for `updateDietEntry`. */
export interface PortionTotals { kcal: number; p: number; c: number | null; f: number | null; micro: Micro | null }

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The basis of an eaten entry: its stored portion (or 1 when none was recorded) and its totals divided by it. */
export function portionBasis(e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'x'>): PortionBasis {
  const recorded = e.x !== undefined && e.x > 0, x = recorded ? e.x! : 1;
  const micro = scaleMicro(e.micro, 1 / x);
  return { x, recorded, per: { kcal: e.kcal / x, p: e.p / x, ...(e.c !== undefined ? { c: e.c / x } : {}), ...(e.f !== undefined ? { f: e.f / x } : {}), ...withMicro(micro) } };
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
  const kcal = cleanKcal(per.kcal * x), p = cleanProtein(per.p * x);
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

/** "You ate 2.5 portions" / "You ate 1 portion". */
export const portionWords = (x: number): string => `${x} ${x === 1 ? 'portion' : 'portions'}`;

/** Whether the sheet offers "also save to the recipe": the entry's linked recipe exists and has no amounts (never overwrites). */
export const canSaveToRecipe = (recipe: Pick<Recipe, 'micro'> | undefined): boolean => recipe !== undefined && !(recipe.micro && Object.keys(recipe.micro).length);

/** What the sheet saves, from what is typed: totals at `x` (null total = out of range), one portion's amounts for the optional recipe save. `microPer` is one portion's typed or kept amounts (null for none). */
export function portionValues(i: { shown: PerText; typed: PerText; exact: PerPortion; x: number; microPer: Micro | null }): { totals: PortionTotals | null; per: { kcal: number; p: number; c: number | null; f: number | null }; microPer: Micro | null } {
  const per = resolvePer(i.typed, i.shown, i.exact);
  return { totals: totalsAt({ ...per, micro: i.microPer }, i.x), per, microPer: i.microPer };
}
