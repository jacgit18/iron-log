import { MAX_NUTRIENT_ROWS, NUTRIENT_KEYS, type NutrientKey } from '../shared/nutrientKeys.js';
import type { LabelOther, SupplementLabel } from '../shared/dsldLabel.js';
import type { SupplementNutrient, SupplementServing } from '../types.ts';
import { nutrientLabel } from './nutrientInfo.js';

/* ---------- Putting a label's amounts on a supplement (brief supplement-label-amounts) ----------
   One model for both entry points: adding a catalog supplement (nothing there yet, so every label row is new) and Fill from label on one already in the library (rows the person
   typed). A label row replaces that nutrient's rows (every unit); a row the label does not list is kept, because the person may know better than a label that omits it. A liquid or powder
   serving (no countable units) leaves the serving size alone. Nothing is changed until the caller saves `result`. */

export type FillChange = 'new' | 'replace' | 'same' | 'kept';
export interface FillLine { key: NutrientKey; label: string; current?: Pick<SupplementNutrient, 'amount' | 'unit'>[]; fromLabel?: Pick<SupplementNutrient, 'amount' | 'unit'>; change: FillChange }
export interface FillPlan {
  lines: FillLine[];
  /** What the supplement holds after Replace. */
  result: { nutrients: SupplementNutrient[]; serving?: SupplementServing };
  /** The serving size the label would set, with the one it has now (only when they differ). */
  serving?: { now?: SupplementServing; label: SupplementServing };
  /** False when Replace would change nothing (the label has no tracked amounts, or the supplement already matches). */
  changes: boolean;
}

export const formatAmount = (a: { amount: number; unit: string }) => `${a.amount} ${a.unit}`;
const sameServing = (a?: SupplementServing, b?: SupplementServing) => !!a && !!b && a.units === b.units && (a.form || '') === (b.form || '');

export function planFill(current: { nutrients?: SupplementNutrient[]; serving?: SupplementServing }, label: SupplementLabel): FillPlan {
  const have = current.nutrients ?? [];
  const lines: FillLine[] = [];
  for (const key of NUTRIENT_KEYS) {
    const mine = have.filter(r => r.key === key), theirs = label.rows.find(r => r.key === key);
    if (!mine.length && !theirs) continue;
    const base = { key, label: nutrientLabel(key), ...(mine.length ? { current: mine.map(({ amount, unit }) => ({ amount, unit })) } : {}) };
    if (!theirs) lines.push({ ...base, change: 'kept' });
    else {
      const fromLabel = { amount: theirs.amount, unit: theirs.unit };
      lines.push({ ...base, fromLabel, change: !mine.length ? 'new' : mine.length === 1 && mine[0].amount === theirs.amount && mine[0].unit === theirs.unit ? 'same' : 'replace' });
    }
  }
  const labelKeys = new Set(label.rows.map(r => r.key));
  const nutrients = [...label.rows.map(r => ({ ...r })), ...have.filter(r => !labelKeys.has(r.key)).map(r => ({ ...r }))].slice(0, MAX_NUTRIENT_ROWS);
  const ls = label.serving?.units ? { units: label.serving.units, ...(label.serving.form ? { form: label.serving.form } : {}) } : undefined;
  const serving = ls ?? current.serving;
  const servingChanges = !!ls && !sameServing(ls, current.serving);
  return {
    lines,
    result: { nutrients, ...(serving ? { serving } : {}) },
    ...(servingChanges ? { serving: { ...(current.serving ? { now: current.serving } : {}), label: ls } } : {}),
    changes: lines.some(l => l.change === 'new' || l.change === 'replace') || servingChanges,
  };
}

/** One line for the preview: "Vitamin D  50 mcg", or "amount not stated" for a line the label lists with no amount. */
export const otherLine = (o: LabelOther): { name: string; amount: string } => ({ name: o.name, amount: o.amount !== undefined && o.unit ? `${o.amount} ${o.unit}` : 'amount not stated' });

/** The "Also on the label" lines to show (at most `max`) and how many more there are. */
export function otherShown(label: SupplementLabel, max = 40): { lines: { name: string; amount: string }[]; more: number } {
  return { lines: label.other.slice(0, max).map(otherLine), more: Math.max(0, label.other.length - max) };
}

/** The serving as one phrase for a preview: "2 gummies", or "not stated" when the label gives none. */
export const servingWords = (label: SupplementLabel): string => label.serving?.text ?? 'not stated';
