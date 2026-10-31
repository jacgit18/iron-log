import { gramsOf } from './recipeMacros.js';
import { MAX_SERVING_G } from '../shared/recipes.js';

// Serving size (brief recipe-serving-size): what one serving is, in words and/or grams. Pure, so the estimate and the line are node-tested.

export interface ServingEstimate {
  /** Whole grams per serving, or null when nothing could be worked out. */
  grams: number | null;
  /** Ingredients that gave grams, and the named ones in all. */
  counted: number; total: number;
  /** Named ingredients whose amount is not in g, kg, oz or lb. */
  leftOut: string[];
  /** The sentence under the button. */
  note: string;
}

/** Grams per serving from the ingredients written in g, kg, oz or lb, divided by Servings (blank or 0 counts as 1). Never guesses a cup or a spoon. */
export function estimateServing(rows: { n: string; amt?: string; skip?: boolean }[], servings: number): ServingEstimate {
  const named = rows.filter(r => r.n.trim() && !r.skip);
  const parts = named.map(r => ({ name: r.n.trim(), g: gramsOf(r.amt) }));
  const used = parts.filter(r => r.g !== null);
  const leftOut = parts.filter(r => r.g === null).map(r => r.name);
  const base = { counted: used.length, total: named.length, leftOut };
  if (used.length === 0) return { ...base, grams: null, note: 'No ingredients are written in grams, ounces or pounds.' };
  const per = Math.round(used.reduce((a, r) => a + (r.g ?? 0), 0) / (servings >= 1 ? servings : 1));
  if (per < 1 || per > MAX_SERVING_G) return { ...base, grams: null, note: `That comes to ${per.toLocaleString('en-US')} g a serving, outside 1 to ${MAX_SERVING_G.toLocaleString('en-US')} g.` };
  const note = [`Counted ${used.length} of ${named.length} ingredient${named.length === 1 ? '' : 's'}.`, leftOut.length ? `Left out: ${leftOut.join(', ')}.` : ''].filter(Boolean).join(' ');
  return { ...base, grams: per, note };
}

/** "1 cup (250 g)", "1 cup" or "250 g"; empty when neither is set. */
export function servingLine(serving?: string, servingG?: number): string {
  const text = serving?.trim();
  if (text && servingG) return `${text} (${servingG} g)`;
  return text || (servingG ? `${servingG} g` : '');
}
