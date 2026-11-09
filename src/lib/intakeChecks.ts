/* ---------- Two separate checks of intake against a reference (brief intake-target-and-safety-checks, PR 1) ----------
   For one nutrient the app answers two questions and never merges them: (a) the target check, is the total intake at the recommended amount; (b) the safety check, is the amount the
   limit counts under the upper limit. The limit's `scope` (`nutrientLimits.ts`) says what it counts: 'total' food and supplements, 'supplements' supplements only, 'form' the listed form only
   (the supplement's own rows; a food label does not separate a form). Pure and framework-free. The words say "intake compared to recommended amounts", never anything about a body. */

/** At this share of the upper limit or more the safety check says approaching (exactly the limit is not over). */
export const CLOSE_FRACTION = 0.8;

/** Said beside the warning line, the recommended amount and in the sheet footer (the draft goes to counsel as written; only this constant changes later). */
export const INTAKE_DISCLAIMER = 'Intake compared to recommended amounts and limits, for general information only. It does not account for pregnancy, breastfeeding, medicines or health conditions, and it is not medical advice.';

export interface IntakeAmounts { fromFood: number; fromSupplements: number }
export type LimitScope = 'total' | 'supplements' | 'form';

export type SafetyStatus = 'under' | 'approaching' | 'over' | 'none';
export interface SafetyResult {
  status: SafetyStatus;
  /** The amount the limit counts: food and supplements for 'total', supplements alone for the others. */
  counted: number;
  /** Share of the upper limit, whole percent; absent when there is no limit. */
  percent?: number;
  /** How far over, 0 when not over. */
  over: number;
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The safety check: the amount the limit counts against the upper limit. A null or missing limit is `none` ("no established limit"): never a percent, never 0 or 100%. */
export function safetyCheck(a: IntakeAmounts, ref: { upper?: number | null; scope: LimitScope }): SafetyResult {
  const counted = round3(ref.scope === 'total' ? a.fromSupplements + a.fromFood : a.fromSupplements);
  if (ref.upper === undefined || ref.upper === null || !(ref.upper > 0)) return { status: 'none', counted, over: 0 };
  const over = counted > ref.upper ? round3(counted - ref.upper) : 0;
  return { status: over > 0 ? 'over' : counted >= ref.upper * CLOSE_FRACTION ? 'approaching' : 'under', counted, percent: Math.round((counted / ref.upper) * 100), over };
}

export type TargetStatus = 'below' | 'meets' | 'above' | 'none';
export interface TargetResult {
  status: TargetStatus;
  /** Food plus supplements: the target is about what the person took in, whatever a limit counts. */
  total: number;
  percent?: number;
  /** The recommended amount is reached: at or above its lowest figure. 'above' is beyond the highest figure and is still met. */
  met: boolean;
}

/** The target check: total intake against the recommended amount (`min`, and `max` where it is a range by age and sex). Below the lowest, meets it from there up to the highest, above beyond; `none` with no recommended amount. */
export function targetCheck(a: IntakeAmounts, rec?: { min: number; max: number } | number | null): TargetResult {
  const total = round3(a.fromSupplements + a.fromFood);
  const r = typeof rec === 'number' ? { min: rec, max: rec } : rec;
  if (!r || !(r.min > 0)) return { status: 'none', total, met: false };
  return { status: total < r.min ? 'below' : total > r.max ? 'above' : 'meets', total, percent: Math.round((total / r.min) * 100), met: total >= r.min };
}

/** The average of the days that have data among the last `window` (default 7) entries of `days` (oldest first, `undefined` for a day with no data); `undefined` when none has. */
export function rollingAverage(days: readonly (number | undefined)[], window = 7): { average: number; days: number } | undefined {
  const have = days.slice(-window).filter((d): d is number => d !== undefined);
  if (have.length === 0) return undefined;
  return { average: round3(have.reduce((s, d) => s + d, 0) / have.length), days: have.length };
}
