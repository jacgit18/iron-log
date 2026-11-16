import type { Micro } from '../shared/foodMicro.js';
import { cleanMicro, scaleMicro } from '../shared/foodMicro.js';
import { scaleFood } from '../shared/foods.js';
import { MAX_LINE, MAX_LINES, type LineMatch } from '../shared/ingredientMatch.js';
import { breakdownOfParts, type Breakdown, type BreakdownPart } from './mealMicroBreakdown.js';
import { isRolledUp } from './mealRollup.js';
import type { Recipe, RecipeEst } from '../types.ts';

/* ---------- Fill nutrition (brief recipe-auto-nutrition, PR 3): pure rules, so every shape is a node test ----------
   The sheet sends a recipe's ingredient lines to /api/ingredients/resolve, shows what came back (one row per line), and on Save writes the numbers per
   serving. Nothing here is stored or fetched. Numbers come only from the matched USDA rows (`per100`); the model's part is the match and the grams. */

/** The fields a Fill writes (and Undo puts back); undefined means the field is absent. */
export type FillFields = Pick<Recipe, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'servings' | 'est'>;
export type FillMode = 'blanks' | 'replace';

/** The ingredient lines a Fill sends: named, not skipped, text as "amount name", at most MAX_LINES (the rest are not sent), each cut at MAX_LINE. */
export function fillLines(recipe: Pick<Recipe, 'ing'>): string[] {
  return recipe.ing
    .filter(i => i.n.trim() && !i.skip)
    .map(i => `${i.amt ? `${i.amt.trim()} ` : ''}${i.n.trim()}`.replace(/\s+/g, ' ').slice(0, MAX_LINE).trim())
    .slice(0, MAX_LINES);
}

/** Whether the recipe page offers Fill: a recipe in Mine, not a ready-made food, with at least one ingredient line, not rolled up from linked foods. */
export const canFill = (recipe: Pick<Recipe, 'cat' | 'ing' | 'own'>, mine: boolean): boolean => mine && recipe.cat !== 'ready' && fillLines(recipe).length > 0 && !isRolledUp(recipe);

export type RowState = 'sure' | 'check' | 'none' | 'retry' | 'skip';
export interface FillRow {
  line: string;
  state: RowState;
  /** USDA description, matched rows. */
  food?: string;
  grams?: number;
  gramsFrom?: 'text' | 'converted' | 'guess';
  /** Whether the row can be counted at all (matched with grams above 0): only these get a checkbox. */
  countable: boolean;
}

/** One sheet row per line. A `none` with `retry` is offered again, never shown as "No match". */
export function fillRows(lines: readonly LineMatch[]): FillRow[] {
  return lines.map(m => {
    const countable = m.status === 'matched' && (m.grams ?? 0) > 0 && !!m.per100;
    const state: RowState = m.status === 'skip' ? 'skip' : m.status === 'none' ? (m.retry ? 'retry' : 'none') : !countable ? 'none' : m.confidence === 'high' ? 'sure' : 'check';
    return { line: m.line, state, ...(m.food ? { food: m.food } : {}), ...(m.grams !== undefined ? { grams: m.grams } : {}), ...(m.gramsFrom ? { gramsFrom: m.gramsFrom } : {}), countable };
  });
}

/** The line indexes counted: matched, grams above 0, and not left out by the person (`off`). */
export function countedLines(lines: readonly LineMatch[], off: ReadonlySet<number> = new Set()): number[] {
  return fillRows(lines).flatMap((r, i) => (r.countable && !off.has(i) ? [i] : []));
}

/** Lines that could count: every line but a skipped one ("water", "salt to taste"). */
export const couldCount = (lines: readonly LineMatch[]): number => lines.filter(m => m.status !== 'skip').length;

export interface Filled { kcal: number; p: number; c?: number; f?: number; micro?: Micro; est: RecipeEst }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The recipe's numbers per serving from the counted lines: calories and macros are sums over them (c and f only when a counted food lists them); a nutrient is saved when at least one counted line lists it ("at least"). Null when nothing is counted. */
export function fillNumbers(lines: readonly LineMatch[], off: ReadonlySet<number>, servings: number): Filled | null {
  const idx = countedLines(lines, off);
  if (!idx.length || !(servings >= 1)) return null;
  let kcal = 0, p = 0, c: number | undefined, f: number | undefined;
  const micro: Micro = {};
  for (const i of idx) {
    const m = lines[i]!, s = scaleFood(m.per100!, m.grams!);
    kcal += s.kcal; p += s.p;
    if (s.c !== undefined) c = (c ?? 0) + s.c;
    if (s.f !== undefined) f = (f ?? 0) + s.f;
    for (const [k, v] of Object.entries(s.micro ?? {})) micro[k as keyof Micro] = (micro[k as keyof Micro] ?? 0) + v;
  }
  const per = scaleMicro(micro, 1 / servings), clean = per ? cleanMicro(per) : null;
  return { kcal: Math.round(kcal / servings), p: r1(p / servings), ...(c !== undefined ? { c: r1(c / servings) } : {}), ...(f !== undefined ? { f: r1(f / servings) } : {}), ...(clean ? { micro: clean } : {}), est: { of: idx.length, n: couldCount(lines) } };
}

/** The bars' parts: one per counted line, with its amounts for the grams used; a food that lists nothing still takes part, so the bar says "at least". */
export function breakdownFor(lines: readonly LineMatch[], off: ReadonlySet<number>, servings: number): Breakdown | null {
  const parts: BreakdownPart[] = countedLines(lines, off).map(i => { const m = lines[i]!; return { name: m.food ?? m.line, micro: scaleFood(m.per100!, m.grams!).micro ?? {}, q: 1 }; });
  return parts.length && servings >= 1 ? breakdownOfParts(parts, servings) : null;
}

const has = (n: number | undefined) => n !== undefined;

/** Whether saving would overwrite something: the recipe already has calories, protein, carbs, fat or any vitamin or mineral. */
export const hasNumbers = (r: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f' | 'micro'>): boolean => has(r.kcal) || has(r.p) || has(r.c) || has(r.f) || Object.keys(r.micro ?? {}).length > 0;

/** The fields to write. `replace` takes every filled value, and keeps a typed value the fill did not find; `blanks` keeps each typed number and each existing `micro` key and only adds what is missing. The mark is set in both. Servings are written only when the recipe has none. */
export function applyFill(recipe: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'servings' | 'est'>, filled: Filled, mode: FillMode, servings: number): FillFields {
  const keep = mode === 'blanks';
  // blanks: a typed value wins; replace: the fill's value wins. In both, a value the fill did not find stays (review finding 5): a typed carbs or vitamin is never deleted by a fill that could not list it.
  const pick = (old: number | undefined, nu: number | undefined) => (keep ? (has(old) ? old : nu) : (nu ?? old));
  const micro = keep ? { ...filled.micro, ...recipe.micro } : { ...recipe.micro, ...filled.micro };
  const out: FillFields = {};
  const kcal = pick(recipe.kcal, filled.kcal), p = pick(recipe.p, filled.p), c = pick(recipe.c, filled.c), f = pick(recipe.f, filled.f);
  if (kcal !== undefined) out.kcal = kcal;
  if (p !== undefined) out.p = p;
  if (c !== undefined) out.c = c;
  if (f !== undefined) out.f = f;
  if (micro && Object.keys(micro).length) out.micro = micro;
  // A fill that wrote no value (every number already typed, "blanks") leaves the recipe as it was: no mark, no servings (review finding 3).
  if (!wroteValue(recipe, out)) return fieldsOfPick(recipe);
  out.servings = recipe.servings ?? servings;
  out.est = filled.est;
  return out;
}

const keyed = (m: Micro | undefined) => Object.entries(m ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join(',');
const wroteValue = (r: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f' | 'micro'>, out: FillFields): boolean => out.kcal !== r.kcal || out.p !== r.p || out.c !== r.c || out.f !== r.f || keyed(out.micro) !== keyed(r.micro);

/** Whether saving in this mode would change any value; the sheet turns the button off (and says why) when it would not. */
export const fillWrites = (recipe: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'servings' | 'est'>, filled: Filled, mode: FillMode): boolean => {
  const { est: _e, servings: _s, ...v } = applyFill(recipe, filled, mode, 1);
  return wroteValue(recipe, v);
};

const fieldsOfPick = (r: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f' | 'micro' | 'servings' | 'est'>): FillFields => ({ ...(has(r.kcal) ? { kcal: r.kcal! } : {}), ...(has(r.p) ? { p: r.p! } : {}), ...(has(r.c) ? { c: r.c! } : {}), ...(has(r.f) ? { f: r.f! } : {}), ...(r.micro ? { micro: r.micro } : {}), ...(r.servings ? { servings: r.servings } : {}), ...(r.est ? { est: r.est } : {}) });

/** The recipe's current values of the Fill fields, for Undo. */
export const fieldsOf = (r: Recipe): FillFields => ({ ...(has(r.kcal) ? { kcal: r.kcal! } : {}), ...(has(r.p) ? { p: r.p! } : {}), ...(has(r.c) ? { c: r.c! } : {}), ...(has(r.f) ? { f: r.f! } : {}), ...(r.micro ? { micro: r.micro } : {}), ...(r.servings ? { servings: r.servings } : {}), ...(r.est ? { est: r.est } : {}) });

/** The recipe with its Fill fields replaced by `fields` (absent ones removed). */
export function withFields(r: Recipe, fields: FillFields): Recipe {
  const { kcal: _k, p: _p, c: _c, f: _f, micro: _m, servings: _s, est: _e, ...rest } = r;
  return { ...rest, ...fields };
}

/** Whether a servings value typed in the sheet is usable: a whole number from 1 to 99 (the recipe form's range). */
export const validServings = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 99;

/** "7 of 8 counted". */
export const countedText = (of: number, n: number): string => `${of} of ${n} counted`;

/** The status line after Save. */
export const savedText = (of: number, n: number): string => `Saved. Filled from ${of} of ${n} ingredient${n === 1 ? '' : 's'}.`;

/** The sheet's words for a failed or refused request. */
export function failureText(reason: 'offline' | 'cap' | 'unavailable'): string {
  if (reason === 'cap') return 'You have used today’s 5 fills. Try again tomorrow.';
  if (reason === 'offline') return 'You are offline. You can still type the numbers.';
  return 'Fill nutrition is not available right now.';
}
