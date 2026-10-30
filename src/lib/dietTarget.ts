import type { DietCfg } from '../types.ts';
import type { TargetKey } from '../shared/diet.js';

/* ---------- Daily targets (ADR 086) ----------
   An estimate to start from, not advice. Calories = what your current weight needs to stay the same (15 per lb) plus a daily surplus for the
   gain: 500 kcal per 1 lb a week (3,500 kcal a pound). The weekly gain is the pace your goal date needs, kept between 0.25 and 1 lb a week;
   with no date it is 0.5. Protein is 0.8 g per lb of goal weight, fat is 25% of the calories, carbs are the rest. No height, age or sex is
   used (the app holds none). Cut is not supported yet. All the numbers are here, in one place. */

export const KCAL_PER_LB = 15, PROTEIN_PER_LB = 0.8, FAT_SHARE = 0.25;
export const KCAL_PER_LB_GAINED = 3500;
export const DEFAULT_RATE = 0.5, MIN_RATE = 0.25, MAX_RATE = 1; // lb a week
/** Within this many lb of the goal counts as maintaining. */
export const MAINTAIN_BAND = 2;

export type Direction = 'bulk' | 'maintain';
/** How the calories were reached: maintenance, the daily surplus, the pace (lb a week), and the weeks to the goal at that pace. `capped`: the goal date needs more than MAX_RATE. */
export interface Plan { maintenance: number; surplus: number; rate: number; weeksToGoal: number | null; capped: boolean }
export type Recommendation =
  | { kind: 'none'; reason: 'no-goal' | 'cut' }
  | { kind: 'ok'; direction: Direction | null; kcal: number; protein: number; plan: Plan | null }; // direction and plan are null when no weight is logged yet

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Fat and carbs (g) that go with some calories and protein: fat is FAT_SHARE of the calories, carbs fill the rest (never below 0). */
export function macrosFor(kcal: number, protein: number, fat?: number): { fat: number; carbs: number } {
  const f = fat ?? roundTo((FAT_SHARE * kcal) / 9, 5);
  return { fat: f, carbs: Math.max(0, roundTo((kcal - 4 * protein - 9 * f) / 4, 5)) };
}

/** The recommended calories and protein from the goal weight, the latest logged weight (both lb) and the weeks left to the goal date (null with no date). */
export function recommend(goalLb: number | null | undefined, currentLb: number | null | undefined, weeksLeft?: number | null): Recommendation {
  if (!(typeof goalLb === 'number' && goalLb > 0)) return { kind: 'none', reason: 'no-goal' };
  const cur = typeof currentLb === 'number' && currentLb > 0 ? currentLb : null;
  const protein = roundTo(PROTEIN_PER_LB * goalLb, 5);
  if (cur === null) return { kind: 'ok', direction: null, kcal: roundTo(KCAL_PER_LB * goalLb, 25), protein, plan: null };
  const gap = goalLb - cur;
  if (gap < -MAINTAIN_BAND) return { kind: 'none', reason: 'cut' };
  const maintenance = roundTo(KCAL_PER_LB * cur, 25); // rounded like the target, so the sentence under it matches the number above it
  if (gap <= MAINTAIN_BAND) return { kind: 'ok', direction: 'maintain', kcal: roundTo(KCAL_PER_LB * cur, 25), protein, plan: { maintenance, surplus: 0, rate: 0, weeksToGoal: null, capped: false } };
  const wanted = weeksLeft != null && weeksLeft > 0 ? gap / weeksLeft : DEFAULT_RATE;
  const rate = roundTo(Math.min(MAX_RATE, Math.max(MIN_RATE, wanted)), 0.05);
  const surplus = Math.round((rate * KCAL_PER_LB_GAINED) / 7);
  return { kind: 'ok', direction: 'bulk', kcal: roundTo(KCAL_PER_LB * cur + surplus, 25), protein, plan: { maintenance, surplus, rate, weeksToGoal: Math.round(gap / rate), capped: wanted > MAX_RATE } };
}

/** The sentence under the targets: why there is no recommendation, or what the estimate is made of. */
export function targetNote(rec: Recommendation, goalLb: number | null): string {
  if (rec.kind === 'none') return rec.reason === 'cut' ? 'Cutting isn’t supported yet. Enter your own numbers.' : 'Set a goal weight under Progress to see a recommendation, or enter your own numbers.';
  const lead = 'An estimate to start from, not medical advice.';
  const p = rec.plan;
  if (!p) return `${lead}${goalLb ? ` Based on your goal weight; log your weight for a closer number.` : ''}`;
  const n = (v: number) => v.toLocaleString('en-US');
  if (rec.direction === 'maintain') return `${lead} About ${n(p.maintenance)} calories keeps your weight where it is.`;
  const pace = `${p.rate} lb a week`;
  const cap = p.capped ? ` Your goal date needs more than ${MAX_RATE} lb a week, which is more than is advised, so this uses ${MAX_RATE}.` : '';
  return `${lead} About ${n(p.maintenance)} to stay the same, plus ${n(p.surplus)} a day to gain about ${pace}${p.weeksToGoal ? `; about ${p.weeksToGoal} weeks to ${goalLb ? `${Math.round(goalLb * 10) / 10} lb` : 'your goal'}` : ''}.${cap}`;
}

export interface Targets { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; typed: Record<TargetKey, boolean> }

/** The targets in force: what you typed, else the recommendation, else null. Fat and carbs follow the calories and protein in force unless typed. */
export function targetsFor(typed: DietCfg | undefined, rec: Recommendation): Targets {
  const r = rec.kind === 'ok' ? rec : null;
  const kcal = typed?.kcal ?? r?.kcal ?? null, protein = typed?.protein ?? r?.protein ?? null;
  const m = kcal !== null && protein !== null ? macrosFor(kcal, protein, typed?.fat) : null;
  return {
    kcal, protein,
    fat: typed?.fat ?? m?.fat ?? null,
    carbs: typed?.carbs ?? m?.carbs ?? null,
    typed: { kcal: typed?.kcal !== undefined, protein: typed?.protein !== undefined, carbs: typed?.carbs !== undefined, fat: typed?.fat !== undefined },
  };
}
