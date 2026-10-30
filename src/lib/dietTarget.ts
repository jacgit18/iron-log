import type { DietCfg } from '../types.ts';

/* ---------- Daily calorie and protein target (ADR 086) ----------
   An estimate to start from, not advice: calories are what a body at the goal weight needs (15 per lb), protein is 0.8 g per lb of goal weight.
   A bulk is capped at 500 over what you need now, so a far-off goal does not jump you to a huge number. No height, age or sex is used (the app
   holds none). Cut is not supported yet. All the numbers are here, in one place. */

export const KCAL_PER_LB = 15, PROTEIN_PER_LB = 0.8, MAX_SURPLUS = 500;
/** Within this many lb of the goal counts as maintaining. */
export const MAINTAIN_BAND = 2;

export type Direction = 'bulk' | 'maintain';
export type Recommendation =
  | { kind: 'none'; reason: 'no-goal' | 'cut' }
  | { kind: 'ok'; direction: Direction | null; kcal: number; protein: number }; // direction is null when no weight is logged yet

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** The recommended targets from the goal weight and the latest logged weight (both lb). */
export function recommend(goalLb: number | null | undefined, currentLb: number | null | undefined): Recommendation {
  if (!(typeof goalLb === 'number' && goalLb > 0)) return { kind: 'none', reason: 'no-goal' };
  const cur = typeof currentLb === 'number' && currentLb > 0 ? currentLb : null;
  const protein = roundTo(PROTEIN_PER_LB * goalLb, 5);
  const atGoal = KCAL_PER_LB * goalLb;
  if (cur === null) return { kind: 'ok', direction: null, kcal: roundTo(atGoal, 25), protein };
  const gap = goalLb - cur;
  if (gap < -MAINTAIN_BAND) return { kind: 'none', reason: 'cut' };
  if (gap > MAINTAIN_BAND) return { kind: 'ok', direction: 'bulk', kcal: roundTo(Math.min(atGoal, KCAL_PER_LB * cur + MAX_SURPLUS), 25), protein };
  return { kind: 'ok', direction: 'maintain', kcal: roundTo(atGoal, 25), protein };
}

/** The sentence under the target: why there is no recommendation, or that it is an estimate and what it is based on. */
export function targetNote(rec: Recommendation, goalLb: number | null): string {
  if (rec.kind === 'none') return rec.reason === 'cut' ? 'Cutting isn’t supported yet. Enter your own numbers.' : 'Set a goal weight under Progress to see a recommendation, or enter your own numbers.';
  const based = goalLb ? ` Based on your goal of ${Math.round(goalLb * 10) / 10} lb${rec.direction === 'bulk' ? ' (gaining)' : rec.direction === 'maintain' ? ' (maintaining)' : ''}.` : '';
  return `An estimate to start from, not medical advice.${based}`;
}

export interface Targets { kcal: number | null; protein: number | null; kcalTyped: boolean; proteinTyped: boolean }

/** The targets in force: what you typed, else the recommendation, else null (nothing to show). */
export function targetsFor(typed: DietCfg | undefined, rec: Recommendation): Targets {
  const r = rec.kind === 'ok' ? rec : null;
  return {
    kcal: typed?.kcal ?? r?.kcal ?? null,
    protein: typed?.protein ?? r?.protein ?? null,
    kcalTyped: typed?.kcal !== undefined,
    proteinTyped: typed?.protein !== undefined,
  };
}
