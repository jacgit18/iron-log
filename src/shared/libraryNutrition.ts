import type { RecipeCategory } from '../types.ts';
import { cleanMicro, scaleMicro, type Micro } from './foodMicro.js';

/* ---------- Library recipe nutrition (brief library-recipe-nutrition, ADR 134) ----------
   Estimated per-serving numbers for a Library recipe, stored in `catalog_items.nutrition` by the owner-run batch and served by the API when they
   still match the recipe. Pure rules only, shared by the batch, the server and the client tests: the servings rule, what "counted" means, the
   show rule, the hash that ties numbers to the ingredient lines they came from, and the rescale when servings change on an estimated copy.
   Nothing here reads the resolver: a line is described by the few fields of its match that these rules need (`CountLine`). */

/** The resolver version written into a record (`v`); a re-run that finds a lower one may recompute it. */
export const NUTRITION_VERSION = 1;

/** Estimated servings are a whole number in this range (owner default 2026-11-15); an estimate under the floor is stored as the floor and still flagged. */
export const MIN_EST_SERVINGS = 2, MAX_EST_SERVINGS = 24;
/** A source servings value is trusted up to the largest the importer keeps (the dataset's own words: 113 recipes say 1, 43 say 20 or more). */
export const MAX_SOURCE_SERVINGS = 99;

/** What the rules need to know about one resolved ingredient line (a subset of the resolver's `LineMatch`). */
export interface CountLine { status: 'matched' | 'none' | 'skip'; grams?: number; gramsFrom?: 'text' | 'converted' | 'guess'; confidence?: 'high' | 'low' }

/** The record stored in `catalog_items.nutrition`: numbers per serving, how the servings were found, what was counted and what it was made from. */
export interface LibraryNutrition {
  kcal: number; p: number; c: number; f: number; micro?: Micro;
  /** The servings the numbers are per: the source value, or the estimate when `sEst`. */
  servings: number; sEst?: true;
  /** Lines counted, and lines that could count (a skipped line, such as water, is in neither). */
  of: number; n: number;
  /** `ingredientHash` of the ingredient lines the numbers were worked out from. */
  hash: string;
  /** NUTRITION_VERSION when written. */
  v: number;
}

/** What the API adds to a served Library recipe (inside `data.recipe`): the numbers, and the mark that they are estimated with its count. */
export interface ServedNutrition { kcal: number; p: number; c: number; f: number; micro?: Micro; servings: number; est: { of: number; n: number; sEst?: true } }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const wholeIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/* ---- Hash of the ingredient lines ---- */

/** A short hash (53 bits, 14 hex characters) of the ingredient lines, trimmed and in order. Not a security hash: it only tells that the text changed. */
export function ingredientHash(ing: readonly string[]): string {
  const text = ing.map(l => l.trim()).join('\n');
  let h1 = 0xdeadbeef ^ text.length, h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/* ---- Counting ---- */

/** A line counts when it matched a food and has grams above 0 (a `skip` line, a `none` line and a matched line with no grams do not). */
export const isCounted = (l: CountLine): boolean => l.status === 'matched' && finite(l.grams) && l.grams > 0;
/** Grams to trust: a counted line whose grams were read from the text, or whose match was confident. */
export const isTrusted = (l: CountLine): boolean => isCounted(l) && (l.gramsFrom === 'text' || l.confidence === 'high');

export interface LineCounts { of: number; n: number; trusted: boolean }
/** `of` counted lines out of `n` that could count (skip lines are in neither); `trusted` when at least one counted line has trustworthy grams. */
export function countLines(lines: readonly CountLine[]): LineCounts {
  let of = 0, n = 0, trusted = false;
  for (const l of lines) {
    if (l.status === 'skip') continue;
    n++;
    if (isCounted(l)) { of++; if (isTrusted(l)) trusted = true; }
  }
  return { of, n, trusted };
}

/** The show rule: numbers are served only when at least half of the lines that could count were counted and one counted line has trustworthy grams. */
export const passesShowRule = ({ of, n, trusted }: LineCounts): boolean => n > 0 && of > 0 && of * 2 >= n && trusted;

/** Total grams of the counted lines. */
export const totalGrams = (lines: readonly CountLine[]): number => lines.reduce((t, l) => (isCounted(l) ? t + (l.grams as number) : t), 0);

/* ---- Servings ---- */

/** Typical grams of one serving by category, for estimating servings where the source has none. Set 2026-11-18 (owner-approved) from the medians of the
 *  full Library resolve: 1,097 recipes with a stated servings value, 3,001 recipes with numbers. A category with fewer than 10 such recipes falls back to
 *  `PORTION_FALLBACK_G` (the median of all of them, 244). Seasonings stays 15 (only 3 recipes, below the minimum); sauces is the run's median, 182
 *  (31 recipes; owner, 2026-11-18, after the first hold at 60: the median servings error on those recipes is 200% at 60 g and 50% at 182 g). */
export const PORTION_G: Partial<Record<RecipeCategory, number>> = {
  protein: 319, carbs: 240, sides: 248, sauces: 182, seasonings: 15, drinks: 195, breakfast: 228, dessert: 155, other: 273,
};
export const PORTION_FALLBACK_G = 244;

/** The servings value the source gives (a whole number 1 to 99), or undefined. Never turned into 1 when it is missing. */
export const sourceServings = (v: unknown): number | undefined => (wholeIn(v, 1, MAX_SOURCE_SERVINGS) ? v : undefined);

/** Servings worked out from the grams of the counted lines: total over a typical portion for the category, whole, 2 to 24. Undefined with no grams. */
export function estimateServings(grams: number, cat: RecipeCategory, portionG: Partial<Record<RecipeCategory, number>> = PORTION_G, fallbackG: number = PORTION_FALLBACK_G): number | undefined {
  if (!finite(grams) || grams <= 0) return undefined;
  const portion = portionG[cat] ?? fallbackG;
  return Math.min(MAX_EST_SERVINGS, Math.max(MIN_EST_SERVINGS, Math.round(grams / portion)));
}

/** The servings the numbers are per. The source value is trusted (even 1) and not flagged; without one it is estimated and flagged; with neither source
 *  nor grams there is no servings value, and so no numbers (undefined). Never a silent 1. */
export function servingsFor(source: unknown, grams: number, cat: RecipeCategory, portionG?: Partial<Record<RecipeCategory, number>>): { servings: number; estimated: boolean } | undefined {
  const s = sourceServings(source);
  if (s) return { servings: s, estimated: false };
  const e = estimateServings(grams, cat, portionG);
  return e ? { servings: e, estimated: true } : undefined;
}

/* ---- Building and serving the record ---- */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Per-serving numbers from the totals of the counted lines (sums, not yet divided) and the servings; null when nothing is usable. */
export function perServing(totals: { kcal: number; p: number; c: number; f: number; micro?: Micro }, servings: number): Omit<LibraryNutrition, 'servings' | 'sEst' | 'of' | 'n' | 'hash' | 'v'> | null {
  if (!(servings >= 1) || ![totals.kcal, totals.p, totals.c, totals.f].every(finite)) return null;
  const micro = scaleMicro(totals.micro, 1 / servings);
  return { kcal: Math.round(totals.kcal / servings), p: r1(totals.p / servings), c: r1(totals.c / servings), f: r1(totals.f / servings), ...(micro ? { micro } : {}) };
}

/** Whether `v` is a record the server may serve for a recipe whose ingredient lines are `ing`: well formed, made from these exact lines, and over the half floor. */
export function cleanNutrition(v: unknown, ing: readonly string[]): LibraryNutrition | null {
  if (!isObj(v)) return null;
  const { kcal, p, c, f, servings, of, n, hash } = v;
  if (!finite(kcal) || kcal < 0 || kcal > 5000 || ![p, c, f].every(x => finite(x) && x >= 0 && x <= 500)) return null;
  if (!wholeIn(servings, 1, MAX_SOURCE_SERVINGS) || !wholeIn(of, 1, 100) || !wholeIn(n, 1, 100) || of > n || of * 2 < n) return null;
  if (hash !== ingredientHash(ing)) return null;
  const micro = cleanMicro(v.micro);
  return { kcal: kcal as number, p: p as number, c: c as number, f: f as number, ...(micro ? { micro } : {}), servings, ...(v.sEst === true ? { sEst: true as const } : {}), of, n, hash, v: wholeIn(v.v, 1, 1000) ? v.v : 1 };
}

/** What a served recipe gets from its stored record, or null (serve the recipe as it is) when the record is missing, stale or under the floor. The source's own
 *  servings value is replaced only by the estimate the numbers are per (the same value when the source gave one). */
export function servedNutrition(stored: unknown, ing: readonly string[]): ServedNutrition | null {
  const r = cleanNutrition(stored, ing);
  if (!r) return null;
  return { kcal: r.kcal, p: r.p, c: r.c, f: r.f, ...(r.micro ? { micro: r.micro } : {}), servings: r.servings, est: { of: r.of, n: r.n, ...(r.sEst ? { sEst: true as const } : {}) } };
}

/* ---- Rescale on a copy ---- */

export interface Numbers { kcal?: number; p?: number; c?: number; f?: number; micro?: Micro }

/** A copy whose servings were estimated and whose numbers are untouched: changing servings from `oldServings` to `newServings` keeps the same total, so each
 *  per-serving number is multiplied by old over new. Returns the new numbers (kcal whole, grams one decimal, micro cleaned), or null when a servings value is not usable. */
export function rescaleForServings(nums: Numbers, oldServings: number, newServings: number): Numbers | null {
  if (!(oldServings >= 1) || !(newServings >= 1)) return null;
  const k = oldServings / newServings;
  const out: Numbers = {};
  if (finite(nums.kcal)) out.kcal = Math.round(nums.kcal * k);
  for (const key of ['p', 'c', 'f'] as const) { const x = nums[key]; if (finite(x)) out[key] = r1(x * k); }
  const micro = scaleMicro(nums.micro, k);
  if (micro) out.micro = micro;
  return out;
}
