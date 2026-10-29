import type { Grocery, GroceryItem, GroceryMonth, Recipe, RecipeIngredient } from '../types.ts';
import { haveOf } from './grocery.js';

/* ---------- Recipes against the At home list (ADR 084) ----------
   Pure functions: which At home item an ingredient is, whether you have it this month, and what is missing. The At home tick is the only
   source of "have" (`haveOf`: ticked at home, or bought this month). Matching is by words, not by exact text, because a recipe says
   "freshly grated Parmesan cheese" where your list says "Parmesan"; a person can pin an ingredient to one item (`home`) when the guess is wrong. */

const UNITS = new Set(['cup', 'cups', 'c', 'tbsp', 'tbs', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'g', 'gram', 'grams', 'kg', 'ml', 'l', 'liter', 'liters', 'litre', 'litres', 'clove', 'cloves', 'can', 'cans', 'pinch', 'dash', 'stick', 'sticks', 'slice', 'slices',
  'piece', 'pieces', 'package', 'packages', 'pkg', 'bunch', 'whole', 'large', 'medium', 'small', 'handful', 'sprig', 'sprigs']);
const NUMBER = /^[\d¼-¾⅐-⅞/.,-]+$/;
const FILLER = new Set(['a', 'an', 'the', 'of', 'fresh', 'freshly', 'chopped', 'diced', 'minced', 'sliced', 'grated', 'ground', 'crushed', 'cooked', 'raw', 'optional', 'to', 'taste', 'or', 'and', 'for', 'about']);

/** A recipe line ("1 ½ cups freshly grated Parmesan, divided") as an ingredient: the amount, and the name up to the first comma. */
export function splitIngredient(line: string): RecipeIngredient {
  const text = line.replace(/\s+/g, ' ').trim();
  const words = text.split(' ');
  let i = 0;
  while (i < words.length - 1) {
    const w = words[i]!.toLowerCase().replace(/[().]/g, '');
    if (NUMBER.test(w) || (i > 0 && (UNITS.has(w) || w === 'of')) || (i === 0 && UNITS.has(w) && words.length > 2 && NUMBER.test(words[1]!))) i++;
    else if (/^\(.*\)?$/.test(words[i]!) && i > 0) i++;
    else break;
  }
  const amt = words.slice(0, i).join(' ').trim();
  const name = words.slice(i).join(' ').split(',')[0]!.trim();
  return name ? { n: name, ...(amt ? { amt } : {}) } : { n: text };
}

const singular = (w: string): string =>
  w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y`
  : w.length > 4 && /(ch|sh|x|z|ss|o)es$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;

/** The words of a name that carry its meaning: lower case, punctuation gone, plurals made singular, cooking filler dropped. */
export function nameWords(name: string): string[] {
  const all = name.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(singular);
  const kept = all.filter(w => !FILLER.has(w) && !NUMBER.test(w) && !UNITS.has(w));
  return kept.length ? kept : all;
}

/** The At home item an ingredient is: the one it is pinned to, else the item with the same words, else a one-word name that is the first word
 *  of the other ("Parmesan" for "Parmesan cheese", "chicken" for "chicken thighs"). A one-word name found elsewhere in the other ("butter" in
 *  "peanut butter", "milk" in "coconut milk") is a different product, so it is not a match; pin it by hand when it is one. Null when none. */
export function matchHome(ing: RecipeIngredient, items: GroceryItem[]): GroceryItem | null {
  if (ing.home) { const pinned = items.find(i => i.id === ing.home); if (pinned) return pinned; }
  const w = nameWords(ing.n);
  if (!w.length) return null;
  const key = [...w].sort().join(' ');
  const exact = items.find(i => [...nameWords(i.n)].sort().join(' ') === key);
  if (exact) return exact;
  const lead = (short: string[], long: string[]) => short.length === 1 && long.length <= 2 && long[0] === short[0];
  return items.find(i => { const iw = nameWords(i.n); return iw.length > 0 && (lead(iw, w) || lead(w, iw)); }) ?? null;
}

export interface IngredientStatus { ing: RecipeIngredient; item: GroceryItem | null; have: boolean }
export interface PantryStatus { lines: IngredientStatus[]; have: number; total: number }

/** Each ingredient against the list for one month: the item it is, and whether it is at home (or already bought) that month. */
export function pantryStatus(recipe: Pick<Recipe, 'ing'>, g: Grocery, month: GroceryMonth): PantryStatus {
  const lines = recipe.ing.map(ing => { const item = matchHome(ing, g.items); return { ing, item, have: !!item && !!haveOf(item, month) }; });
  return { lines, have: lines.filter(l => l.have).length, total: lines.length };
}

/** What "Add missing to To get" works on: the ingredients that are not at home. One that is already an item on your list is on To get as it
 *  is (an item with no tick shows there), so it only counts; one with no item is a new name to add, once each by its words. */
export function missingParts(status: PantryStatus): { already: GroceryItem[]; add: string[] } {
  const already: GroceryItem[] = []; const add: string[] = []; const seen = new Set<string>();
  for (const l of status.lines) {
    if (l.have) continue;
    if (l.item) { if (!already.includes(l.item)) already.push(l.item); continue; }
    const key = [...nameWords(l.ing.n)].sort().join(' ');
    if (key && !seen.has(key)) { seen.add(key); add.push(l.ing.n); }
  }
  return { already, add };
}
