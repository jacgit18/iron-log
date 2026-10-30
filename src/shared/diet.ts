import type { DietCfg, DietEntry } from '../types.ts';
import { same } from './same.js';
import { str } from './stretchWeek.js';
import { validDate } from './validate.js';

/* ---------- Diet shapes: one thing you ate, and the targets you typed (ADR 086) ----------
   `normDietEntry` takes anything and returns the clean entry (or null when it can't be used); `validDietEntry` is stricter and says whether a
   value is already clean, for the API to refuse what the app would never send. Same split as recipes (src/shared/recipes.ts). */

export const MAX_DIET_PER_DAY = 20, RETAIN_DAYS = 400, MAX_DIET_ENTRIES = MAX_DIET_PER_DAY * RETAIN_DAYS;
export const MAX_DIET_ID = 60, MAX_DIET_NAME = 80;
export const MAX_KCAL = 9999, MAX_PROTEIN = 999;
/** The lowest target you can type: below this it is a slip, not a plan. */
export const MIN_TARGET_KCAL = 500, MIN_TARGET_PROTEIN = 10;

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Calories as stored: a whole number from 1 to 9,999, or null. */
export const cleanKcal = (v: unknown): number | null => (fin(v) && Math.round(v) >= 1 && Math.round(v) <= MAX_KCAL ? Math.round(v) : null);
/** Protein in grams as stored: 0 to 999, one decimal, or null. */
export const cleanProtein = (v: unknown): number | null => (fin(v) && round1(v) >= 0 && round1(v) <= MAX_PROTEIN ? round1(v) : null);
/** Carbs or fat in grams as stored: the same range as protein (0 to 999, one decimal), or null. */
export const cleanGrams = cleanProtein;

/** One entry, cleaned. Null without an id, a real date, a name, or numbers in range. */
export function normDietEntry(x: unknown): DietEntry | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, MAX_DIET_ID), n = str(o.n, MAX_DIET_NAME), from = str(o.from, MAX_DIET_ID);
  const kcal = cleanKcal(o.kcal), p = cleanProtein(o.p);
  if (!id || !n || !validDate(o.d) || kcal === null || p === null) return null;
  const c = o.c === undefined ? null : cleanGrams(o.c), f = o.f === undefined ? null : cleanGrams(o.f); // optional: an unusable one is left out
  return { id, d: o.d, n, kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}), ...(from ? { from } : {}) };
}

/** Whether `v` is an entry exactly as the app writes one. */
export const validDietEntry = (v: unknown): v is DietEntry => { const c = normDietEntry(v); return c !== null && same(c, v); };

/** Where an entry sits in the synced list: its day counted from 2020-01-01 (0 to 9999, the list's position limit), so deleting or pruning an entry never moves the rest. Entries of one day tie and are ordered by id. */
export function dietPosition(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Math.max(0, Math.min(9999, Math.round((Date.UTC(y!, m! - 1, day!) - Date.UTC(2020, 0, 1)) / 864e5)));
}

/** The entries of a stored list, cleaned: the unusable and repeated ones dropped, at most MAX_DIET_ENTRIES in all. The 20 a day limit is enforced when one is added, not here: two devices can both log to one day, and reading must not drop what was synced. */
export function normDietEntries(items: unknown): DietEntry[] {
  const seen = new Set<string>();
  const out: DietEntry[] = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const e = normDietEntry(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id); out.push(e);
    if (out.length >= MAX_DIET_ENTRIES) break;
  }
  return out;
}

/** Why a typed target can't be saved, or null. `value` null means cleared. */
export type TargetKey = 'kcal' | 'protein' | 'carbs' | 'fat';
const TARGET_NAME: Record<TargetKey, string> = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
export function targetError(key: TargetKey, value: number | null): string | null {
  if (value === null) return null;
  const min = key === 'kcal' ? MIN_TARGET_KCAL : MIN_TARGET_PROTEIN, max = key === 'kcal' ? MAX_KCAL : MAX_PROTEIN;
  return Number.isFinite(value) && Math.round(value) >= min && Math.round(value) <= max ? null : `${TARGET_NAME[key]} must be ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`;
}

/** The targets you typed (`cfg.diet`): only the keys that are in range survive; undefined when none do. */
export function normDietCfg(v: unknown): DietCfg | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const pick = (k: TargetKey) => (targetError(k, fin(o[k]) ? (o[k] as number) : NaN) === null && fin(o[k]) ? Math.round(o[k] as number) : null);
  const out: DietCfg = {};
  (['kcal', 'protein', 'carbs', 'fat'] as const).forEach(k => { const n = pick(k); if (n !== null) out[k] = n; });
  return Object.keys(out).length ? out : undefined;
}
