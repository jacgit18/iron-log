import type { GroceryItem, Recipe } from '../types.ts';
import { nameWords } from './recipePantry.js';

/* ---------- Ingredient suggestions while typing (recipe customising brief) ----------
   Local only: your Groceries items first (choosing one pins the ingredient to it), then ingredient names you have already used in your
   recipes. No network, no food database. Pure, so the ranking is a node test. */

export const MAX_SUGGESTIONS = 8;

export interface Suggestion { n: string; home?: string }

const words = (s: string) => s.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Names matching what was typed: every typed word starts a word of the name. Best first: the name starts with the typed text, then
 *  shorter names, then A to Z. Empty text offers nothing. A grocery item and a recipe ingredient with the same words appear once, as the
 *  grocery item. */
export function suggestIngredients(text: string, items: GroceryItem[], recipes: Recipe[]): Suggestion[] {
  const typed = words(text);
  if (!typed.length) return [];
  const lead = text.trim().toLowerCase();
  const seen = new Set<string>();
  const out: (Suggestion & { key: string })[] = [];
  const add = (n: string, home?: string) => {
    const w = words(n);
    if (!w.length || !typed.every(t => w.some(x => x.startsWith(t)))) return;
    const key = [...nameWords(n)].sort().join(' ') || n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ n, ...(home ? { home } : {}), key });
  };
  for (const it of items) add(it.n, it.id);
  for (const r of recipes) for (const i of r.ing) add(i.n);
  const starts = (n: string) => n.toLowerCase().startsWith(lead);
  return out
    .sort((a, b) => Number(starts(b.n)) - Number(starts(a.n)) || a.n.length - b.n.length || a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ key: _k, ...s }) => s);
}

/** The Groceries item whose name is exactly what was typed (ignoring case and spaces), for pinning; null when none. */
export function exactItem(text: string, items: GroceryItem[]): GroceryItem | null {
  const t = text.trim().replace(/\s+/g, ' ').toLowerCase();
  return t ? items.find(i => i.n.trim().replace(/\s+/g, ' ').toLowerCase() === t) ?? null : null;
}

/** The Groceries item id an ingredient is pinned to when its name is typed: the item with exactly that name, but never for a swapped
 *  ingredient (a pin outranks the swap in the match, so it would hide the swap). */
export const pinFor = (name: string, sub: string | undefined, items: GroceryItem[]): string | undefined => (sub ? undefined : exactItem(name, items)?.id);
