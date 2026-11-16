import { MICRO_UNIT } from '../shared/foodMicro.js';
import { NUTRIENT_KEYS } from '../shared/nutrientKeys.js';
import type { NutrientKey } from '../shared/nutrientKeys.js';
import type { Recipe } from '../types.ts';
import { nutrientLabel } from './nutrientInfo.js';
import { isRolledUp, numbersOf } from './mealRollup.js';

/* ---------- A meal's vitamins and minerals, part by part (brief meal-micro-breakdown): pure, so every shape is a node test ----------
   `mealRollup` adds a meal's linked parts into one `micro`; this reads the same parts and the same numbers (`numbersOf`) and keeps each part's share
   of every nutrient, so a bar can show who adds what. It is read-only: nothing here is stored. A nutrient is listed when at least one part lists it; the
   total is what the listed parts add up to (`atLeast` when a part does not list it), which equals the stored roll-up whenever every part lists it. */

/** Parts that get their own color; later parts merge into one "Other" segment. */
export const MAX_SEGMENTS = 5;

export interface Segment {
  /** 1 to MAX_SEGMENTS, or 'other' for the merged tail. */
  slot: number | 'other';
  name: string;
  /** Per serving, in the nutrient's unit; null when no part in the segment lists the nutrient. */
  amount: number | null;
  /** This segment's part of the row's total, 0 to 1 (the shares of a row add up to 1; 0 for a not-listed segment): the bar sizes its segments by it, never by the raw amount. */
  share: number;
  /** Names of the parts in this segment that do not list the nutrient. */
  missing: string[];
}
export interface BreakdownRow {
  key: NutrientKey;
  label: string;
  unit: 'mg' | 'mcg' | 'g';
  /** Per serving: what the parts that list it add up to. */
  total: number;
  /** True when a part does not list this nutrient, so the real total could be higher. */
  atLeast: boolean;
  segments: Segment[];
}
export interface Breakdown { rows: BreakdownRow[]; /** The segments in order, for the legend: the same on every row. */ legend: { slot: number | 'other'; name: string }[] }

type MealInput = Pick<Recipe, 'ing'> & Partial<Pick<Recipe, 'id' | 'servings' | 'own'>>;

/** An amount for display: two decimals at most, no trailing zeros. */
export const fmtAmount = (n: number): string => String(Math.round(n * 100) / 100);

/** A part of a meal for the bars: its name, its amounts per one unit of it, and how many units go in (q). */
export interface BreakdownPart { name: string; micro: Partial<Record<NutrientKey, number>>; q: number }

/** The rows and legend for parts already worked out; shared by a meal built from linked foods and by Fill nutrition's review sheet (parts there are ingredient lines). Null when no part lists any nutrient. */
export function breakdownOfParts(used: readonly BreakdownPart[], servings: number): Breakdown | null {
  const slotOf = (idx: number): number | 'other' => (idx < MAX_SEGMENTS ? idx + 1 : 'other');
  const groups = new Map<number | 'other', BreakdownPart[]>();
  used.forEach((u, idx) => { const s = slotOf(idx); groups.set(s, [...(groups.get(s) ?? []), u]); });
  const rows: BreakdownRow[] = [];
  for (const key of NUTRIENT_KEYS) {
    if (!used.some(u => u.micro[key] !== undefined)) continue;
    const raw = [...groups].map(([slot, parts]) => {
      const listed = parts.filter(p => p.micro[key] !== undefined);
      return {
        slot,
        name: slot === 'other' ? 'Other' : parts[0]!.name,
        amount: listed.length ? listed.reduce((a, p) => a + p.micro[key]! * p.q, 0) / servings : null,
        missing: parts.filter(p => p.micro[key] === undefined).map(p => p.name),
      };
    });
    const total = raw.reduce((a, s) => a + (s.amount ?? 0), 0), known = raw.filter(s => s.amount !== null).length;
    const segments: Segment[] = raw.map(s => ({ ...s, share: s.amount === null ? 0 : total > 0 ? s.amount / total : 1 / known })); // amounts that are all 0 share the bar equally
    rows.push({ key, label: nutrientLabel(key), unit: MICRO_UNIT[key], total, atLeast: segments.some(s => s.missing.length > 0), segments });
  }
  if (!rows.length) return null;
  return { rows, legend: [...groups].map(([slot, parts]) => ({ slot, name: slot === 'other' ? 'Other' : parts[0]!.name })) };
}

/** The breakdown of a meal built from linked foods, or null when there is nothing to show: no linked parts, the person's own numbers, or no part with vitamin or mineral data. */
export function mealMicroBreakdown(meal: MealInput, recipes: readonly Recipe[]): Breakdown | null {
  if (!isRolledUp(meal)) return null;
  const path = meal.id ? new Set<string>().add(meal.id) : new Set<string>();
  const servings = meal.servings && meal.servings >= 1 ? meal.servings : 1;
  const used: BreakdownPart[] = [];
  for (const i of meal.ing.filter(x => x.n.trim() && !x.skip)) {
    if (!i.rid || i.q === undefined || i.skip) continue;
    const part = path.has(i.rid) ? undefined : recipes.find(r => r.id === i.rid);
    if (!part) continue; // a deleted part reads as plain text; a link back to itself adds nothing
    const n = numbersOf(part, recipes, path, 0);
    if (n) used.push({ name: part.n, micro: n.micro ?? {}, q: i.q });
  }
  if (!used.length) return null;
  return breakdownOfParts(used, servings);
}
