import { cleanGrams, type FoodHit } from '../shared/foods.js';

// "Calculate from ingredients" (brief recipe-ingredient-macros): the rules behind the recipe form's helper. An ingredient's grams are read from its amount
// when it is written in g, kg, oz or lb; each picked food's numbers (per 100 g, from the food lookup) are scaled to those grams, added up and divided by
// the recipe's servings. Pure, so every shape is a node test; the panel keeps state and markup only. Nothing here is stored.

const GLYPH: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const G = Object.keys(GLYPH).join('');
// One quantity: "1½" or "1 ½", "½", "1 1/2", "1/2", "1.5", "2".
const QTY = new RegExp(`^\\s*(?:(\\d+)\\s*([${G}])|([${G}])|(\\d+)\\s+(\\d+)/(\\d+)|(\\d+)/(\\d+)|(\\d+(?:\\.\\d+)?))`);
const GRAMS_PER: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };

/** The grams an amount stands for ("200 g", "½ lb", "1 ½ kg"), to one decimal; null when it is not written in g, kg, oz or lb ("2 cups", "3", "pinch"), is a range ("2-3 oz") or has a second quantity ("1 lb / 450 g"). */
export function gramsOf(amt: string | undefined): number | null {
  if (!amt) return null;
  const m = QTY.exec(amt);
  if (!m) return null;
  let q: number;
  if (m[2]) q = Number(m[1]) + GLYPH[m[2]]!;
  else if (m[3]) q = GLYPH[m[3]]!;
  else if (m[4]) { if (!Number(m[6])) return null; q = Number(m[4]) + Number(m[5]) / Number(m[6]); }
  else if (m[7]) { if (!Number(m[8])) return null; q = Number(m[7]) / Number(m[8]); }
  else q = Number(m[9]);
  const rest = amt.slice(m[0].length);
  const u = /^\s*([A-Za-z]+)\.?(.*)$/.exec(rest);
  const per = u ? GRAMS_PER[u[1]!.toLowerCase()] : undefined;
  if (!u || per === undefined) return null;
  if (/[\d¼-¾⅓-⅞]/.test(u[2]!)) return null; // a second quantity, a range or a size in brackets
  const g = Math.round(q * per * 10) / 10;
  return g > 0 ? g : null;
}

/** The grams for one row: what was typed in the Grams box when there is something there, else what the amount says; null when neither gives 1 to 5000 grams. */
export function rowGrams(amt: string | undefined, typed: string): number | null {
  return typed.trim() !== '' ? cleanGrams(typed) : cleanGrams(gramsOf(amt));
}

/** The servings the totals are divided by: a whole number from 1 to 99, else 1 (`assumed` says it was not typed). */
export function servingsFor(text: string): { servings: number; assumed: boolean } {
  const n = /^\d{1,2}$/.test(text.trim()) ? Number(text) : 0;
  return n >= 1 ? { servings: n, assumed: false } : { servings: 1, assumed: true };
}

export interface MacroRow { name: string; grams: number | null; hit: FoodHit | null }
export interface MacroTotals {
  /** Per serving; carbs and fat only when every counted food has them. */
  per: { kcal: number; p: number; c?: number; f?: number };
  counted: number;
  total: number;
  /** The names left out (no food picked, or no grams). */
  leftOut: string[];
  /** Which of carbs and fat some counted food did not have. */
  missing: ('carbs' | 'fat')[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The recipe's numbers per serving from the rows that have both a food and grams. */
export function totals(rows: MacroRow[], servings: number): MacroTotals {
  const used = rows.filter((r): r is MacroRow & { grams: number; hit: FoodHit } => r.grams !== null && r.hit !== null);
  const leftOut = rows.filter(r => r.grams === null || r.hit === null).map(r => r.name);
  const sum = (pick: (h: FoodHit) => number | undefined) => used.reduce((a, r) => a + (pick(r.hit) ?? 0) * r.grams / 100, 0) / servings;
  const missing: MacroTotals['missing'] = [];
  const hasC = used.every(r => r.hit.c !== undefined), hasF = used.every(r => r.hit.f !== undefined);
  if (used.length > 0 && !hasC) missing.push('carbs');
  if (used.length > 0 && !hasF) missing.push('fat');
  return {
    per: { kcal: Math.round(sum(h => h.kcal)), p: round1(sum(h => h.p)), ...(used.length > 0 && hasC ? { c: round1(sum(h => h.c)) } : {}), ...(used.length > 0 && hasF ? { f: round1(sum(h => h.f)) } : {}) },
    counted: used.length, total: rows.length, leftOut, missing,
  };
}

/** "Counted 4 of 6 ingredients." plus what was left out and which macros are missing. */
export function totalsNote(t: MacroTotals): string {
  const parts = [`Counted ${t.counted} of ${t.total} ingredient${t.total === 1 ? '' : 's'}.`];
  if (t.leftOut.length > 0) parts.push(`Left out: ${t.leftOut.join(', ')}.`);
  if (t.missing.length > 0) parts.push(`Some foods have no ${t.missing.join(' or ')}, so ${t.missing.length === 2 ? 'those stay' : 'that stays'} as typed.`);
  return parts.join(' ');
}
