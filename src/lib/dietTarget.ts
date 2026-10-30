import type { DietCfg } from '../types.ts';
import type { TargetKey } from '../shared/diet.js';

/* ---------- Daily targets (ADR 086) ----------
   An estimate to start from, not advice. Calories = what your current weight needs to stay the same (15 per lb), plus a daily surplus to gain
   or minus a daily deficit to lose: 500 kcal a day per 1 lb a week (3,500 kcal a pound). The pace is the one you picked (Slow, Steady, Fast or
   your own lb a week); with none picked it is the pace your goal date needs, else Steady. A gain is held to 1 lb a week; a loss to 1.5 lb and to
   1% of your body weight a week, and never below a calorie floor. Protein is 0.8 g per lb of goal weight, fat is 25% of the calories, carbs are
   the rest. No height, age or sex is used (the app holds none). All the numbers are here, in one place. */

export const KCAL_PER_LB = 15, PROTEIN_PER_LB = 0.8, FAT_SHARE = 0.25;
export const KCAL_PER_LB_CHANGED = 3500;
/** lb a week for each preset, by direction. Steady is the pace used when you pick nothing and the goal has no date. */
export const GAIN_RATES = { slow: 0.25, steady: 0.5, fast: 1 } as const;
export const LOSE_RATES = { slow: 0.5, steady: 1, fast: 1.5 } as const;
export const MIN_RATE = 0.25, MAX_GAIN_RATE = 1, MAX_LOSE_RATE = 1.5, MAX_LOSE_SHARE = 0.01; // lb a week; a loss is also held to this share of your weight
export const FLOOR_KCAL = 1500, FLOOR_SHARE = 0.75; // a cut never goes below the higher of FLOOR_KCAL and this share of maintenance
/** A goal under this many lb, or this share of your weight (more than a third off), gets no cut recommendation: the app has no height or age to judge it, so it declines rather than guess. */
export const MIN_GOAL_LB = 90, MIN_GOAL_SHARE = 0.65;
/** Within this many lb of the goal counts as maintaining. */
export const MAINTAIN_BAND = 2;

export type Direction = 'bulk' | 'cut' | 'maintain';
/** Your pick: a preset, or Custom with a rate (lb a week). Nothing picked means "By date" when the goal has a date, else Steady. */
export type PaceChoice = Pick<DietCfg, 'pace' | 'rate'>;
/** How the calories were reached: maintenance, the daily change (plus for a gain, minus for a cut), the pace (lb a week) and the weeks to the goal at that pace.
 *  `capped`: the pace asked for was above `limit`. `floor`: set when a cut was held at that many calories. `from`: where the pace came from. */
export interface Plan { maintenance: number; change: number; rate: number; weeksToGoal: number | null; capped: boolean; limit: number; from: 'date' | 'pick' | 'default'; datePassed?: true; floor?: number }
export type Recommendation =
  | { kind: 'none'; reason: 'no-goal' | 'low-goal' }
  | { kind: 'ok'; direction: Direction | null; kcal: number; protein: number; plan: Plan | null }; // direction and plan are null when no weight is logged yet

const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const toStep = (rate: number) => Math.round(rate * 20) / 20; // steps of 0.05, as a division by 20 so 7 steps is 0.35, not 0.35000000000000003

/** The most lb a week the app will suggest for this direction and body weight. */
export function maxRate(direction: 'bulk' | 'cut', currentLb: number): number {
  return direction === 'bulk' ? MAX_GAIN_RATE : Math.min(MAX_LOSE_RATE, Math.floor(MAX_LOSE_SHARE * currentLb * 20 + 1e-9) / 20);
}

/** Fat and carbs (g) that go with some calories and protein: fat is FAT_SHARE of the calories, carbs fill the rest (never below 0). */
export function macrosFor(kcal: number, protein: number, fat?: number): { fat: number; carbs: number } {
  const f = fat ?? roundTo((FAT_SHARE * kcal) / 9, 5);
  return { fat: f, carbs: Math.max(0, roundTo((kcal - 4 * protein - 9 * f) / 4, 5)) };
}

/** The recommended calories and protein from the goal weight, the latest logged weight (both lb), the weeks left to the goal date (null with no date) and your pace pick. */
export function recommend(goalLb: number | null | undefined, currentLb: number | null | undefined, weeksLeft?: number | null, choice?: PaceChoice): Recommendation {
  if (!(typeof goalLb === 'number' && goalLb > 0)) return { kind: 'none', reason: 'no-goal' };
  const cur = typeof currentLb === 'number' && currentLb > 0 ? currentLb : null;
  const protein = roundTo(PROTEIN_PER_LB * goalLb, 5);
  if (cur === null) return { kind: 'ok', direction: null, kcal: roundTo(KCAL_PER_LB * goalLb, 25), protein, plan: null };
  const gap = goalLb - cur;
  const maintenance = roundTo(KCAL_PER_LB * cur, 25); // rounded like the target, so the sentence under it matches the number above it
  if (Math.abs(gap) <= MAINTAIN_BAND) return { kind: 'ok', direction: 'maintain', kcal: maintenance, protein, plan: { maintenance, change: 0, rate: 0, weeksToGoal: null, capped: false, limit: 0, from: 'default' } };
  const direction = gap > 0 ? 'bulk' : 'cut';
  if (direction === 'cut' && (goalLb < MIN_GOAL_LB || goalLb < MIN_GOAL_SHARE * cur)) return { kind: 'none', reason: 'low-goal' };
  const limit = maxRate(direction, cur);
  const presets = direction === 'bulk' ? GAIN_RATES : LOSE_RATES;
  const pace = choice?.pace;
  let wanted: number, from: Plan['from'];
  if (pace === 'custom' && typeof choice?.rate === 'number' && choice.rate > 0) { wanted = choice.rate; from = 'pick'; }
  else if (pace === 'slow' || pace === 'steady' || pace === 'fast') { wanted = presets[pace]; from = 'pick'; }
  else if (weeksLeft != null && weeksLeft > 0) { wanted = Math.abs(gap) / weeksLeft; from = 'date'; }
  else { wanted = presets.steady; from = 'default'; }
  const capped = wanted > limit;
  let rate = toStep(Math.min(limit, Math.max(from === 'date' ? MIN_RATE : 0.05, wanted)));
  let change = Math.round((rate * KCAL_PER_LB_CHANGED) / 7) * (direction === 'cut' ? -1 : 1);
  let kcal = roundTo(KCAL_PER_LB * cur + change, 25);
  let floor: number | undefined;
  if (direction === 'cut') {
    const min = Math.ceil(Math.max(FLOOR_KCAL, FLOOR_SHARE * KCAL_PER_LB * cur) / 25) * 25;
    if (kcal < min) {
      floor = min;
      kcal = Math.min(min, maintenance); // a very light person: the floor can be above what keeps them the same, so hold them at maintenance
      rate = toStep(Math.max(0, ((maintenance - kcal) * 7) / KCAL_PER_LB_CHANGED));
      change = kcal - maintenance;
    }
  }
  return { kind: 'ok', direction, kcal, protein, plan: { maintenance, change, rate, weeksToGoal: rate > 0 ? Math.round(Math.abs(gap) / rate) : null, capped: capped && !floor, limit, from, ...(floor ? { floor } : {}), ...(from === 'default' && weeksLeft != null && weeksLeft <= 0 ? { datePassed: true as const } : {}) } };
}

/** The sentence under the targets: why there is no recommendation, or what the estimate is made of. */
export function targetNote(rec: Recommendation, goalLb: number | null): string {
  if (rec.kind === 'none' && rec.reason === 'low-goal') return 'That goal weight is lower than this app can advise a target for, so it shows no recommendation. Talk to a doctor or dietitian about a safe goal, or enter your own numbers.';
  if (rec.kind === 'none') return 'Set a goal weight under Progress to see a recommendation, or enter your own numbers.';
  const lead = 'An estimate to start from, not medical advice.';
  const p = rec.plan;
  if (!p) return `${lead}${goalLb ? ` Based on your goal weight; log your weight for a closer number.` : ''}`;
  const n = (v: number) => v.toLocaleString('en-US');
  if (rec.direction === 'maintain') return `${lead} About ${n(p.maintenance)} calories keeps your weight where it is.`;
  if (p.rate === 0) return `${lead} About ${n(p.maintenance)} calories keeps your weight where it is. Your goal needs fewer calories than is advised without knowing more about you, so this holds your weight.`;
  const cut = rec.direction === 'cut';
  const goal = goalLb ? `${Math.round(goalLb * 10) / 10} lb` : 'your goal';
  const main = `About ${n(p.maintenance)} to stay the same, ${cut ? 'minus' : 'plus'} ${n(Math.abs(p.change))} a day to ${cut ? 'lose' : 'gain'} about ${p.rate} lb a week${p.weeksToGoal ? `; about ${p.weeksToGoal} weeks to ${goal}` : ''}.`;
  const past = p.datePassed ? ` Your goal date has passed, so this uses ${p.rate} lb a week.` : '';
  const cap = p.capped ? (p.from === 'date' ? ` Your goal date needs more than ${p.limit} lb a week, which is more than is advised, so this uses ${p.limit}.` : ` ${p.limit} lb a week is the most that is advised, so this uses ${p.limit}.`) : '';
  const held = p.floor ? ` Calories are held at ${n(rec.kcal)}, the lowest that is advised without knowing more about you.` : '';
  return `${lead} ${main}${past}${cap}${held}`;
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
