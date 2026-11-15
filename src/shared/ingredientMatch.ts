import { cleanHits, cleanQuery, MAX_GRAMS, type FoodHit } from './foods.js';

// Recipe auto nutrition (brief recipe-auto-nutrition): the shape of one matched ingredient line and the pure rules around it. Shared by the server (which asks the
// model and USDA, server/ingredients.ts) and the app (which re-checks the answer). The model's words are data: a food id is kept only when the server showed it,
// grams only in range, and the confidence is set here, never by the model. Nothing here is stored.

export const MAX_LINES = 40;
export const MAX_LINE = 140;
export const MIN_GRAMS = 1;

/** One ingredient line's result, one per line sent, in order. This is the contract the Library recipe brief builds on: do not change it without that brief. */
export interface LineMatch {
  /** The text as sent, amount then name. */
  line: string;
  /** none: no USDA plain food fits; skip: water, "salt to taste". */
  status: 'matched' | 'none' | 'skip';
  /** matched only. */
  fdcId?: number;
  /** USDA description, matched only. */
  food?: string;
  /** 1 to 5000, matched only. */
  grams?: number;
  /** text: g, kg, oz, lb or grams in brackets; converted: cups, spoons, ml, counts of a sized item; guess: no amount. */
  gramsFrom?: 'text' | 'converted' | 'guess';
  confidence?: 'high' | 'low';
  /** The USDA row per 100 g (kcal, p, c, f, micro), matched only. */
  per100?: FoodHit;
}

/** The request's lines, cleaned: 1 to MAX_LINES strings, each squeezed and cut at MAX_LINE characters. Null when it is not that (the route answers 422); an empty line is refused, not dropped, so the answer stays one per line sent. */
export function cleanLines(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_LINES) return null;
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== 'string') return null;
    // oxlint-disable-next-line no-control-regex
    const t = raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LINE).trim();
    if (!t) return null;
    out.push(t);
  }
  return out;
}

/** The text a cached result is filed under: lower case, squeezed, no trailing full stop or comma. Two lines that differ only in that give one cache entry. */
export const normalizeLine = (line: string): string => line.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.,;:\s]+$/, '');

const GLYPH: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const G = Object.keys(GLYPH).join('');
const UNIT_G: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };
const UNITS = Object.keys(UNIT_G).join('|');
// "1½", "1 ½", "½", "1 1/2", "1/2", "1.5", "2"
const QTY = `(?:(\\d+)\\s*([${G}])|([${G}])|(\\d+)\\s+(\\d+)/(\\d+)|(\\d+)/(\\d+)|(\\d+(?:\\.\\d+)?))`;
const LEAD = new RegExp(`^\\s*${QTY}\\s*(${UNITS})\\b\\.?(?![\\w/-]*\\d)`, 'i');
const BRACKET = new RegExp(`[(\\[]\\s*${QTY}\\s*(${UNITS})\\b\\.?\\s*(?:[,;)\\]])`, 'i');

function quantity(m: RegExpExecArray): number | null {
  if (m[2]) return Number(m[1]) + GLYPH[m[2]]!;
  if (m[3]) return GLYPH[m[3]]!;
  if (m[4]) return Number(m[6]) ? Number(m[4]) + Number(m[5]) / Number(m[6]) : null;
  if (m[7]) return Number(m[8]) ? Number(m[7]) / Number(m[8]) : null;
  return Number(m[9]);
}
function toGrams(m: RegExpExecArray | null): number | null {
  if (!m) return null;
  const q = quantity(m), per = UNIT_G[m[10]!.toLowerCase()];
  if (q === null || per === undefined) return null;
  const g = Math.round(q * per * 10) / 10;
  return g >= MIN_GRAMS && g <= MAX_GRAMS ? g : null;
}

/** Grams written in brackets after the amount ("½ cup (100 g) flour", "1 cup [120 g, sifted]"), read by code before any model call. Null when there is none or it is not one clear weight. */
export const bracketGrams = (line: string): number | null => toGrams(BRACKET.exec(line));

/** Grams when the line starts with a weight ("200 g flour", "½ lb butter", "1 1/2 kg"). Null for "2-3 oz" and anything not written in g, kg, oz or lb. */
export const leadingGrams = (line: string): number | null => toGrams(LEAD.exec(line));

/** The grams the text itself states, leading weight first, else grams in brackets. */
export const textGrams = (line: string): number | null => leadingGrams(line) ?? bracketGrams(line);

/** The server's confidence: high only when the grams came from the text or a unit conversion and the pick is not approximate. */
export const confidenceOf = (gramsFrom: 'text' | 'converted' | 'guess', approximate: boolean): 'high' | 'low' => (gramsFrom !== 'guess' && !approximate ? 'high' : 'low');

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const FROM = ['text', 'converted', 'guess'] as const;

/** A search term from the model, or null: brackets (USDA answers 400 to them) are blanked, then the food search's own 2 to 60 character rule. */
export const cleanTerm = (v: unknown): string | null => (typeof v === 'string' ? cleanQuery(v.replace(/[()[\]{}"]/g, ' ')) : null);

export interface PlanLine { skip: boolean; term: string | null; grams: number | null; gramsFrom: 'text' | 'converted' | 'guess' }

/** Call 1's answer: one entry per line sent, by position. Anything unreadable for a line leaves it with no term (it ends as `none`); a wrong length is refused. */
export function cleanPlan(raw: unknown, n: number): PlanLine[] | null {
  const list = obj(raw)?.lines;
  if (!Array.isArray(list) || list.length !== n) return null;
  return list.map(item => {
    const o = obj(item) ?? {};
    const g = typeof o.grams === 'number' && Number.isFinite(o.grams) ? Math.round(o.grams * 10) / 10 : null;
    return {
      skip: o.skip === true,
      term: cleanTerm(o.term),
      grams: g !== null && g >= MIN_GRAMS && g <= MAX_GRAMS ? g : null,
      gramsFrom: FROM.find(f => f === o.gramsFrom) ?? 'guess',
    };
  });
}

export interface Pick { id: number | null; approximate: boolean }

/** Call 2's answer: for each line position, the food id the model chose and whether it called the match approximate. An id that is not in `shown` for that line becomes null. */
export function cleanPicks(raw: unknown, shown: Map<number, Set<number>>): Map<number, Pick> {
  const out = new Map<number, Pick>();
  const list = obj(raw)?.picks;
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    const o = obj(item);
    if (!o || typeof o.i !== 'number' || !shown.has(o.i) || out.has(o.i)) continue;
    const id = typeof o.id === 'number' && shown.get(o.i)!.has(o.id) ? o.id : null;
    out.set(o.i, { id, approximate: o.approximate !== false });
  }
  return out;
}

/** One result read back (from the cache or from our own route), checked again. `line` is the text the caller sent. A matched result needs a food, grams in range, a known source of the grams and a per-100 g row for the same food; anything else is `none`. */
export function cleanLineMatch(raw: unknown, line: string): LineMatch {
  const o = obj(raw);
  if (o?.status === 'skip') return { line, status: 'skip' };
  if (o?.status !== 'matched') return { line, status: 'none' };
  const per100 = cleanHits({ hits: [o.per100] })[0];
  const gramsFrom = FROM.find(f => f === o.gramsFrom);
  const grams = typeof o.grams === 'number' && Number.isFinite(o.grams) && o.grams >= MIN_GRAMS && o.grams <= MAX_GRAMS ? o.grams : null;
  const confidence = o.confidence === 'high' || o.confidence === 'low' ? o.confidence : null;
  if (!per100 || per100.id !== o.fdcId || typeof o.food !== 'string' || !o.food || !gramsFrom || grams === null || !confidence) return { line, status: 'none' };
  return { line, status: 'matched', fdcId: per100.id, food: o.food.slice(0, 80), grams, gramsFrom, confidence, per100 };
}

/** The answer's lines, one per line sent: the shape is checked again, and a missing or extra entry makes the whole answer unusable (null). */
export function cleanAnswer(json: unknown, sent: string[]): LineMatch[] | null {
  const list = obj(json)?.lines;
  if (!Array.isArray(list) || list.length !== sent.length) return null;
  return list.map((item, i) => cleanLineMatch(item, sent[i]!));
}
