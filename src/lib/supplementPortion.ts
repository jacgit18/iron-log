import type { SupplementItem, SupplementNutrient, SupplementServing } from '../types.ts';

/* ---------- How much of a serving you take each time (brief supplement-portions, ADR 109) ----------
   Each nutrient row on a supplement is the amount in ONE label serving. `portion` is the servings taken per intake, stored in servings (1 capsule of a
   2-capsule serving is 0.5) so a later change to the serving size keeps its meaning; absent means exactly one serving. Amount taken = row amount x portion.
   Pure: the sheet's stepper, the day's tag and the totals read these. */

export const MAX_PORTION = 10;
export const SERVINGS_STEP = 0.25;
export const DEFAULT_FORM = 'capsule';
/** The words the sheet offers for one unit of a serving (stored lowercase in `serving.form`, spelled with a capital there). */
export const FORM_WORDS = ['capsule', 'tablet', 'softgel', 'gummy', 'scoop'] as const;

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** A stored or typed portion as the one value kept: a finite number above 0 up to 10, at most four decimals; 1 (one serving) and anything else unusable is "none". */
export function normPortion(x: unknown): number | undefined {
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0 || x > MAX_PORTION) return undefined;
  const p = round4(x);
  return p === 1 || p <= 0 ? undefined : p;
}

export const portionOf = (item: Pick<SupplementItem, 'portion'>): number => item.portion ?? 1;

/** Capsules (or tablets) in one serving, when the product says so. */
export const unitsOf = (serving: SupplementServing | undefined | null): number | undefined => (serving && serving.units > 0 ? serving.units : undefined);

/** The step of the stepper in servings: one capsule when the serving size is known, a quarter serving when it is not. */
export const stepOf = (units: number | undefined): number => (units ? 1 / units : SERVINGS_STEP);

/** The nearest allowed value for a step: a multiple of the step, at least one step, at most 10 servings. */
export function snapPortion(p: number, units: number | undefined): number {
  const st = stepOf(units);
  const n = Math.max(1, Math.round(p / st + 1e-9));
  return Math.min(MAX_PORTION, round4(n * st));
}

/** One tap on the stepper: `dir` is 1 or -1. Never below one step or above 10 servings. */
export function stepPortion(p: number, dir: 1 | -1, units: number | undefined): number {
  const st = stepOf(units);
  const cur = snapPortion(p, units);
  return Math.min(MAX_PORTION, Math.max(round4(st), snapPortion(cur + dir * st, units)));
}

const fraction: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
/** 1.5 becomes "1½", 0.3333 becomes "0.33". */
export function fmtServings(n: number): string {
  const whole = Math.floor(n + 1e-9), rest = round4(n - whole);
  if (rest === 0) return String(whole);
  const f = fraction[String(rest)];
  if (f) return whole ? `${whole}${f}` : f;
  return String(Math.round(n * 100) / 100);
}

export const formWord = (serving: SupplementServing | undefined | null): string => (serving?.form || '').trim().toLowerCase() || DEFAULT_FORM;
const plural = (word: string, n: number) => (n === 1 ? word : `${word}s`);

/** "2 capsules", "1 tablet", or in servings "½ serving" when the serving size is not known. */
export function portionText(portion: number, serving: SupplementServing | undefined | null): string {
  const units = unitsOf(serving);
  if (units) { const n = Math.round(portion * units * 100) / 100; return `${fmtServings(n)} ${plural(formWord(serving), n)}`; }
  return `${fmtServings(portion)} ${portion > 1 ? 'servings' : 'serving'}`;
}

/** The day's tag next to an intake that is not exactly one serving; empty for one serving (no tag). */
export const portionTag = (item: Pick<SupplementItem, 'portion' | 'serving'>): string => (item.portion && item.portion !== 1 ? portionText(item.portion, item.serving) : '');

/** The amount in what you take each time, in the row's own unit: "300 mg". */
export const amountTaken = (row: Pick<SupplementNutrient, 'amount'>, portion: number): number => Math.round(row.amount * portion * 1000) / 1000;

const fmtAmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** The two lines under the stepper, from the product's first nutrient row. `label` is the nutrient's name ("magnesium"). Without a row it says what to add. */
export function milligramLines(row: { amount: number; unit: string } | undefined, label: string, portion: number, serving: SupplementServing | undefined | null): { main: string; detail: string } {
  if (!row || !(row.amount > 0)) return { main: '', detail: 'Add what is in one serving to see the amount you take.' };
  const total = amountTaken(row, portion);
  const main = `${fmtAmt(total)} ${row.unit} ${label}`;
  const units = unitsOf(serving);
  if (!units) return { main, detail: `${fmtAmt(row.amount)} ${row.unit} per serving × ${fmtServings(portion)} = ${fmtAmt(total)} ${row.unit}. Steps of ¼ from ¼ to ${MAX_PORTION}.` };
  const n = Math.round(portion * units * 100) / 100;
  const each = Math.round((row.amount / units) * 1000) / 1000;
  return { main, detail: `${fmtServings(n)} × ${fmtAmt(each)} ${row.unit} per ${formWord(serving)} = ${fmtAmt(total)} ${row.unit}. That is ${fmtServings(portion)} ${portion > 1 ? 'servings' : 'serving'} (the label serving is ${fmtServings(units)} ${plural(formWord(serving), units)}, ${fmtAmt(row.amount)} ${row.unit}).` };
}
