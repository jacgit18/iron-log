import type { GroceryItem, Recipe, RecipeIngredient } from '../types.ts';
import { nameWords } from './recipePantry.js';

/* ---------- Ingredient suggestions while typing (recipe customising brief) ----------
   Local only: your Groceries items first (choosing one pins the ingredient to it), then ingredient names you have already used in your
   recipes. No network, no food database. Pure, so the ranking is a node test. */

export const MAX_SUGGESTIONS = 8;

/** `tag`: what a sauce or seasoning of yours is called in the option text ("Seasoning"); `home`: the Groceries item id. */
export interface Suggestion { n: string; home?: string; tag?: string }

const words = (s: string) => s.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Names matching what was typed: every typed word starts a word of the name. Best first: the name starts with the typed text, then
 *  shorter names, then A to Z. Empty text offers nothing. A grocery item and a recipe ingredient with the same words appear once, as the
 *  grocery item. Your Sauces and Seasonings (`sauces`, see `sauceCandidates`) come first, tagged, and win a name they share with an item. */
export function suggestIngredients(text: string, items: GroceryItem[], recipes: Recipe[], sauces: Recipe[] = []): Suggestion[] {
  const typed = words(text);
  if (!typed.length) return [];
  const lead = text.trim().toLowerCase();
  const seen = new Set<string>();
  const out: (Suggestion & { key: string; sauce?: true })[] = [];
  const add = (n: string, home?: string, sauce?: Recipe) => {
    const w = words(n);
    if (!w.length || !typed.every(t => w.some(x => x.startsWith(t)))) return;
    const key = [...nameWords(n)].sort().join(' ') || n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ n, ...(home ? { home } : {}), ...(sauce ? { tag: sauceTag(sauce), sauce: true as const } : {}), key });
  };
  for (const s of sauces) add(s.n, undefined, s);
  for (const it of items) add(it.n, it.id);
  for (const r of recipes) for (const i of r.ing) add(i.n);
  const starts = (n: string) => n.toLowerCase().startsWith(lead);
  return out
    .sort((a, b) => Number(!!b.sauce) - Number(!!a.sauce) || Number(starts(b.n)) - Number(starts(a.n)) || a.n.length - b.n.length || a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ key: _k, sauce: _s, ...s }) => s);
}

/** The Groceries item whose name is exactly what was typed (ignoring case and spaces), for pinning; null when none. */
export function exactItem(text: string, items: GroceryItem[]): GroceryItem | null {
  const t = text.trim().replace(/\s+/g, ' ').toLowerCase();
  return t ? items.find(i => i.n.trim().replace(/\s+/g, ' ').toLowerCase() === t) ?? null : null;
}

/** The Groceries item id an ingredient is pinned to when its name is typed: the item with exactly that name, but never for a swapped
 *  ingredient (a pin outranks the swap in the match, so it would hide the swap). */
export const pinFor = (name: string, sub: string | undefined, items: GroceryItem[]): string | undefined => (sub ? undefined : exactItem(name, items)?.id);

/* ---------- Sauces and seasonings as ingredients (brief recipe-sauce-ingredients) ----------
   An ingredient line can link to one of your own Sauces or Seasonings recipes by id (`rid`); the line's name stays as the fallback text.
   A link is not a copy: nothing of the sauce is rolled into the recipe, and a deleted sauce leaves plain text. */

/** "Sauce" or "Seasoning": the tag shown next to a linkable recipe's name. */
export const sauceTag = (r: Recipe): string => (r.cat === 'seasonings' ? 'Seasoning' : 'Sauce');

const byName = (a: Recipe, b: Recipe) => a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/** The recipes an ingredient can link to: your Sauces and Seasonings, never the recipe being edited (`exceptId`), A to Z. */
export const sauceCandidates = (recipes: Recipe[], exceptId?: string): Recipe[] =>
  recipes.filter(r => (r.cat === 'sauces' || r.cat === 'seasonings') && r.id !== exceptId).sort(byName);

/** The candidates matching what was typed in the picker: every typed word starts a word of the name. Order kept (A to Z). */
export function filterSauces(list: Recipe[], text: string): Recipe[] {
  const typed = words(text);
  return typed.length ? list.filter(r => { const w = words(r.n); return typed.every(t => w.some(x => x.startsWith(t))); }) : list;
}

/** The sauce an ingredient name is exactly (ignoring case and spaces), for linking; undefined when none. */
export function sauceFor(name: string, sauces: Recipe[]): Recipe | undefined {
  const t = name.trim().replace(/\s+/g, ' ').toLowerCase();
  return t ? sauces.find(r => r.n.trim().replace(/\s+/g, ' ').toLowerCase() === t) : undefined;
}

/** The recipe a line links to, or undefined (no link, the sauce was deleted, or it points at the recipe itself). The link resolves by id, so a
 *  renamed sauce shows its new name and a sauce moved to another category stays linked. */
export const linkedRecipe = (ing: RecipeIngredient, recipes: Recipe[], selfId?: string): Recipe | undefined =>
  ing.rid && ing.rid !== selfId ? recipes.find(r => r.id === ing.rid) : undefined;

/** A line as the form should show it: the link kept with the sauce's current name, or dropped when the sauce is gone. */
export function refreshLink<T extends RecipeIngredient>(ing: T, recipes: Recipe[], selfId?: string): T {
  if (!ing.rid) return ing;
  const { rid: _rid, ...rest } = ing;
  const r = linkedRecipe(ing, recipes, selfId);
  return r ? { ...rest, n: r.n, rid: r.id } as T : rest as T;
}
