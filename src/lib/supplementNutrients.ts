import { LIMIT_KEYS, NUTRIENT_KEYS } from '../shared/nutrientKeys.js';
import type { NutrientKey, NutrientUnit } from '../shared/nutrientKeys.js';
import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { limitOf } from './nutrientLimits.js';
import { scheduled } from './supplements.js';

/* ---------- A day's nutrient totals from supplements ----------
   Each nutrient row on a supplement is the amount in ONE serving; ticking the item on a day counts one serving.
   'taken' sums the ticked scheduled items, 'scheduled' sums every scheduled item. Units convert only where a standard factor exists
   (mg, mcg and g to the limit's unit; vitamin D IU to mcg at 40 IU per mcg, NIH ODS); anything else (vitamin A and E in IU, which depend on the
   form) is listed in `notAdded`, never guessed. `fromFood` is the day's eaten foods that list the nutrient (brief food-vitamins-minerals): it joins `total` only where the limit counts food (`scope: 'total'`), because the supplements-only limit (magnesium) and the one-form limits (folate, niacin, vitamin A, vitamin E) cover something a food label does not separate, so adding food would overstate. */

export type TotalsBasis = 'taken' | 'scheduled';

export interface NutrientProduct { itemId: string; name: string; amount: number; unit: NutrientUnit }
export interface NotAdded extends NutrientProduct { reason: string }
export interface NutrientTotal {
  key: NutrientKey;
  /** The limit's unit; every number below is in it. */
  unit: 'mg' | 'mcg';
  fromSupplements: number;
  fromFood: number;
  /** Whether `fromFood` is part of `total` (the limit counts food), or only shown beside it. */
  foodCounted: boolean;
  total: number;
  /** The products that add to the total, with their amount in `unit` (biggest first). */
  products: { itemId: string; name: string; amount: number }[];
  notAdded: NotAdded[];
}
export type LimitStatus = 'under' | 'close' | 'over';

const IU_PER_MCG_D = 40;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The amount in the limit's unit, or a reason it cannot be converted. */
export function toLimitUnit(key: NutrientKey, amount: number, unit: NutrientUnit, to: 'mg' | 'mcg'): { value: number } | { reason: string } {
  if (unit === 'IU') {
    if (key === 'vitaminD') return { value: round3(to === 'mcg' ? amount / IU_PER_MCG_D : amount / IU_PER_MCG_D / 1000) };
    return { reason: 'IU depends on the form (natural or synthetic, retinol or beta-carotene); enter mg or mcg to count it' };
  }
  const mg = unit === 'g' ? amount * 1000 : unit === 'mcg' ? amount / 1000 : amount;
  return { value: round3(to === 'mg' ? mg : mg * 1000) };
}

export const countedItems = (items: SupplementItem[], taken: Taken, date: string, basis: TotalsBasis): SupplementItem[] => {
  const day = taken[date] || {};
  return scheduled(items).filter(i => basis === 'scheduled' || day[i.id]);
};

/** The foods of a day that list at least one vitamin or mineral, and how many were eaten in all: the sheet says so, because a food with no data adds nothing and the total can be low. */
// Only the nutrients the sheet can show count (those with a limit, LIMIT_KEYS) until the sheet has a section for the others (brief nutrients-without-upper-limit, PR 2): a food that lists only sodium or fiber
// would otherwise open Totals to an empty sheet and be counted as having data.
export const foodCoverage = (eaten: readonly DietEntry[]): { eaten: number; withData: number } => ({ eaten: eaten.length, withData: eaten.filter(e => LIMIT_KEYS.some(k => e.micro?.[k] !== undefined)).length });

/** One entry per nutrient that a counted supplement or an eaten food lists, in the order of the limits table. `eaten` is the day's diet entries. */
export function supplementNutrientTotals(items: SupplementItem[], taken: Taken, date: string, basis: TotalsBasis = 'taken', eaten: readonly DietEntry[] = []): NutrientTotal[] {
  const by = new Map<NutrientKey, NutrientTotal>();
  const entryFor = (key: NutrientKey): NutrientTotal => {
    let t = by.get(key);
    if (!t) { const limit = limitOf(key)!; t = { key, unit: limit.unit, fromSupplements: 0, fromFood: 0, foodCounted: limit.scope === 'total', total: 0, products: [], notAdded: [] }; by.set(key, t); }
    return t;
  };
  for (const item of countedItems(items, taken, date, basis)) {
    for (const row of item.nutrients || []) {
      const limit = limitOf(row.key);
      if (!limit) continue;
      const t = entryFor(row.key);
      const c = toLimitUnit(row.key, row.amount, row.unit, limit.unit);
      if ('reason' in c) { t.notAdded.push({ itemId: item.id, name: item.n, amount: row.amount, unit: row.unit, reason: c.reason }); continue; }
      t.fromSupplements = round3(t.fromSupplements + c.value);
      t.products.push({ itemId: item.id, name: item.n, amount: c.value });
    }
  }
  for (const e of eaten) {
    for (const k of NUTRIENT_KEYS) {
      const a = e.micro?.[k];
      if (a === undefined || !limitOf(k)) continue; // a food's amounts are already in the limit's unit (MICRO_UNIT)
      const t = entryFor(k);
      t.fromFood = round3(t.fromFood + a);
    }
  }
  const order = (k: NutrientKey) => NUTRIENT_KEYS.indexOf(k);
  return [...by.values()].map(t => ({ ...t, total: round3(t.fromSupplements + (t.foodCounted ? t.fromFood : 0)), products: t.products.sort((a, b) => b.amount - a.amount) })).sort((a, b) => order(a.key) - order(b.key));
}

/** under the limit, close (80% or more of it) or over (above it; exactly the limit is not over). */
export function limitStatus(t: Pick<NutrientTotal, 'key' | 'total'>): { status: LimitStatus; percent: number; over: number } {
  const limit = limitOf(t.key);
  if (!limit) return { status: 'under', percent: 0, over: 0 };
  const percent = Math.round((t.total / limit.upper) * 100);
  const over = t.total > limit.upper ? round3(t.total - limit.upper) : 0;
  return { status: over > 0 ? 'over' : t.total >= limit.upper * 0.8 ? 'close' : 'under', percent, over };
}

export const overLimit = (totals: NutrientTotal[]): NutrientTotal[] => totals.filter(t => limitStatus(t).status === 'over');
