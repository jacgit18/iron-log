import { NUTRIENT_KEYS } from '../shared/nutrientKeys.js';
import type { NutrientKey } from '../shared/nutrientKeys.js';
import { MICRO_UNIT } from '../shared/foodMicro.js';
import type { Micro } from '../shared/foodMicro.js';
import type { DietEntry, Recipe } from '../types.ts';
import type { Profile } from '../shared/profile.js';
import { fmtAmount } from './amountFormat.js';
import { recommendedFor } from './nutrientGroups.js';
import { limitOf } from './nutrientLimits.js';
import { nutrientLabel } from './nutrientInfo.js';
import { targetOf } from './nutrientTargets.js';

/* ---------- What a food gives most of (brief recipe-auto-nutrition): pure, so every shape is a node test ----------
   A food's `micro` is per portion eaten or planned. Each nutrient is read as a share of a day's recommended amount (the person's own when a profile gives one, else the highest adult figure in the
   limits or targets table). The planned card and the eaten row show the top two, an opened card and the row sheet the top five. Sodium is left out: its figure is a level to stay under, so
   "Sodium 80%" would read as a good thing. Nothing here warns. */

export const LINE_NAMES = 2, LIST_NAMES = 5;

export interface MicroShare {
  key: NutrientKey;
  label: string;
  unit: 'mg' | 'mcg' | 'g';
  amount: number;
  /** Whole percent of a day's recommended amount (not capped: 140 reads 140). */
  percent: number;
  /** "Manganese 23%". */
  text: string;
}

/** A day's recommended amount for a nutrient: the person's own, else the highest adult figure; undefined when no table has one (or for sodium). */
export function recommendedAmount(key: NutrientKey, profile?: Profile, today?: string): number | undefined {
  if (key === 'sodium') return undefined;
  const own = profile && today ? recommendedFor(key, profile, today) : undefined;
  return own ?? limitOf(key)?.recommended.max ?? targetOf(key)?.recommended.max;
}

/** Every nutrient `micro` lists, as a share of the day's recommended amount, biggest first (a tie keeps the table order). `factor` scales the amounts (a planned card's portion). */
export function microShares(micro: Micro | undefined, factor = 1, profile?: Profile, today?: string): MicroShare[] {
  if (!micro || !(factor > 0)) return [];
  const out: MicroShare[] = [];
  for (const key of NUTRIENT_KEYS) {
    const a = micro[key];
    const rec = recommendedAmount(key, profile, today);
    if (a === undefined || !rec) continue;
    const amount = a * factor, percent = Math.round((amount / rec) * 100), label = nutrientLabel(key);
    out.push({ key, label, unit: MICRO_UNIT[key], amount, percent, text: `${label} ${percent}%` });
  }
  return out.sort((a, b) => b.percent - a.percent); // stable: equal shares keep NUTRIENT_KEYS order
}

/** The one line under a card or row: "Manganese 23% · Copper 17%"; empty when the food lists nothing we can read a share of. */
export const microLine = (shares: readonly MicroShare[]): string => shares.slice(0, LINE_NAMES).map(s => s.text).join(' · ');

/** The opened list: the top five with their amounts, "Manganese 0.5 mg · 23% of a day". */
export const microList = (shares: readonly MicroShare[]): { key: NutrientKey; text: string }[] => shares.slice(0, LIST_NAMES).map(s => ({ key: s.key, text: `${s.label} ${fmtAmount(s.amount)} ${s.unit}, ${s.percent}% of a day` }));

/** The mark's words, shown as text beside the line: "Estimated" when the food's numbers came from ingredient lines. */
export const ESTIMATED = 'Estimated';

/** What a planned card draws: a ticked card shows what its entry logged (as eaten, `factor` 1, marked by the entry); a planned one its recipe's per-serving amounts times the portion, marked while the recipe's numbers are estimated and it has vitamins. A saved-meal card (`kind` 'm') draws nothing. */
export function cardVitamins(kind: 'r' | 'm', entry: Pick<DietEntry, 'micro' | 'est'> | undefined, recipe: Pick<Recipe, 'micro' | 'est'> | undefined, portion: number): { micro: Micro | undefined; factor: number; est: boolean } | null {
  if (kind !== 'r') return null;
  if (entry) return { micro: entry.micro, factor: 1, est: entry.est === true };
  return { micro: recipe?.micro, factor: portion, est: !!recipe?.est && !!recipe.micro };
}
