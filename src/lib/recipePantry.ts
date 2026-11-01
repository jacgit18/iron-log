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

/* ---------- Same ingredient, two names ----------
   Pairs that are the same thing in a US kitchen, folded to one name before words are compared, so "scallions" finds "Green onions".
   Keep it short and exact: near-substitutes (butter and margarine, lemon and lime juice) are a swap, not a synonym, and a regional name
   that means something else elsewhere (coriander seeds, castor sugar) is left out. Each row: the name the others become, then the others. */
export const SYNONYMS: readonly (readonly [string, ...string[]])[] = [
  ['scallion', 'green onion'],
  ['cilantro', 'coriander leaf', 'coriander leaves', 'fresh coriander'],
  ['chickpea', 'garbanzo bean', 'garbanzo'],
  ['powdered sugar', 'confectioners sugar', 'icing sugar'],
  ['zucchini', 'courgette'],
  ['eggplant', 'aubergine'],
  ['bell pepper', 'sweet pepper'],
];
const SYNONYM_RULES: readonly [RegExp, string][] = SYNONYMS.flatMap(([to, ...from]) =>
  [...from].sort((a, b) => b.length - a.length).map((f): [RegExp, string] => [new RegExp(`\\b${f}(?:s|es)?\\b`, 'g'), to]));
const fold = (text: string): string => SYNONYM_RULES.reduce((t, [re, to]) => t.replace(re, to), text);

const singular = (w: string): string =>
  w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y`
  : w.length > 4 && /(ch|sh|x|z|ss|o)es$/.test(w) ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;

/** The words of a name that carry its meaning: lower case, punctuation gone, plurals made singular, cooking filler dropped. */
export function nameWords(name: string): string[] {
  const all = fold(name.toLowerCase().replace(/['’]/g, '')).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(singular);
  const kept = all.filter(w => !FILLER.has(w) && !NUMBER.test(w) && !UNITS.has(w));
  return kept.length ? kept : all;
}

const WATER_KINDS = new Set(['tap', 'cold', 'warm', 'hot', 'boiling', 'ice', 'iced', 'lukewarm', 'filtered']);
/** Water, which every kitchen has: "water", "cold water", "boiling water", "ice water". "Coconut water" and "water chestnuts" are not. */
export const isAlwaysHave = (name: string): boolean => {
  const w = nameWords(name);
  return w.includes('water') && w.every(x => x === 'water' || WATER_KINDS.has(x));
};

/** What the ingredient is called: always the name in the recipe. An Alternative never replaces it (owner, 2026-10-31); it is only another way to have it at home. */
export const ingredientName = (ing: RecipeIngredient): string => ing.n;

/** The At home item an ingredient is: the one it is pinned to, else the item with the same words, else the item whose name holds all the
 *  words of a two-or-more-word name or is held by it and ends in the same word ("chicken breast" and "boneless chicken breast"; the fewest extra words wins), else a
 *  one-word name that is the first word of the other ("Parmesan" for "Parmesan cheese", "chicken" for "chicken thighs"). A one-word name
 *  found elsewhere in the other ("butter" in "peanut butter", "milk" in "coconut milk") is a different product, so it is not a match; pin it
 *  by hand when it is one. Names are compared after synonyms are folded ("scallion" is "green onion"). Null when none. */
export function matchHome(ing: RecipeIngredient, items: GroceryItem[]): GroceryItem | null {
  if (ing.home) { const pinned = items.find(i => i.id === ing.home); if (pinned) return pinned; }
  const w = nameWords(ingredientName(ing));
  if (!w.length) return null;
  const key = [...w].sort().join(' ');
  const exact = items.find(i => [...nameWords(i.n)].sort().join(' ') === key);
  if (exact) return exact;
  // The same last word (the thing itself) is required, so "red wine" is not "red wine vinegar" and "cream cheese" is not "cream cheese frosting".
  const holds = (long: string[], short: string[]) => short.length >= 2 && long.at(-1) === short.at(-1) && short.every(x => long.includes(x));
  const around = items.flatMap(i => { const iw = nameWords(i.n); return iw.length > 0 && (holds(iw, w) || holds(w, iw)) ? [{ i, extra: Math.abs(iw.length - w.length) }] : []; });
  if (around.length) return around.reduce((a, b) => (b.extra < a.extra ? b : a)).i;
  const lead = (short: string[], long: string[]) => short.length === 1 && long.length <= 2 && long[0] === short[0];
  return items.find(i => { const iw = nameWords(i.n); return iw.length > 0 && (lead(iw, w) || lead(w, iw)); }) ?? null;
}

/* Words too general to say two names are alike: "red onion" and "red wine vinegar" are not close because both are red. */
const COMMON_ADJECTIVES = new Set(['red', 'green', 'white', 'black', 'brown', 'yellow', 'dark', 'light', 'sweet', 'hot', 'cold', 'warm', 'whole', 'extra', 'virgin', 'plain', 'dry', 'dried', 'low', 'fat', 'free', 'organic', 'boneless', 'skinless', 'baby']);
const closeness = (ing: RecipeIngredient, item: GroceryItem): number => {
  const a = nameWords(ingredientName(ing)).filter(x => !COMMON_ADJECTIVES.has(x));
  const b = new Set(nameWords(item.n));
  return a.filter(x => b.has(x)).length;
};

/** Your At home items from the likeliest for this ingredient to the least, for the pick list: most words in common first, then the shorter
 *  name, then A to Z. */
export function rankItems(ing: RecipeIngredient, items: GroceryItem[]): GroceryItem[] {
  return items.map(i => ({ i, c: closeness(ing, i) }))
    .sort((x, y) => y.c - x.c || x.i.n.length - y.i.n.length || x.i.n.localeCompare(y.i.n, undefined, { sensitivity: 'base' }))
    .map(x => x.i);
}

/** The item to offer as "Maybe" for an ingredient that matches nothing by itself: the likeliest one that shares a meaningful word, or null.
 *  Never used as a match: only a tap pins it. */
export function suggestItem(ing: RecipeIngredient, items: GroceryItem[]): GroceryItem | null {
  const best = rankItems(ing, items)[0];
  return best && closeness(ing, best) > 0 ? best : null;
}

export interface IngredientStatus { ing: RecipeIngredient; item: GroceryItem | null; have: boolean; skipped: boolean; always: boolean; partial: boolean; suggest: GroceryItem | null }
export interface PantryStatus { lines: IngredientStatus[]; have: number; total: number }

/** Each ingredient against the list for one month: the item it is, and whether it is at home (or already bought) that month. A skipped
 *  ingredient stays in `lines` but is not counted in `have` and `total`. A line linked to one of your sauces or seasonings (`rid`, found in
 *  `recipes`) is also at home when every ingredient of that sauce is, since you make it rather than buy it; `seen` stops a sauce that links
 *  back to itself. */
export function pantryStatus(recipe: Pick<Recipe, 'ing'> & { id?: string }, g: Grocery, month: GroceryMonth, recipes: readonly Recipe[] = [], seen: ReadonlySet<string> = new Set()): PantryStatus {
  const visited = recipe.id ? new Set(seen).add(recipe.id) : seen;
  const lines = recipe.ing.map((ing): IngredientStatus => {
    const alt = ing.sub?.trim();
    const skipped = !!ing.skip, always = !skipped && (isAlwaysHave(ingredientName(ing)) || (!!alt && isAlwaysHave(alt)));
    const main = always ? null : matchHome(ing, g.items);
    // The ingredient is at home when its own item is, or else when the Alternative's item is: "if you don't have it, use this".
    const altItem = always || (main && haveOf(main, month)) || !alt ? null : matchHome({ n: alt }, g.items);
    const item = altItem && haveOf(altItem, month) ? altItem : main;
    const sauce = ing.rid && !visited.has(ing.rid) ? recipes.find(r => r.id === ing.rid) : undefined;
    const made = !skipped && !always && sauce ? pantryStatus(sauce, g, month, recipes, visited) : null;
    const madeAtHome = !!made && made.total > 0 && made.have === made.total;
    const have = always || madeAtHome || (!!item && !!haveOf(item, month));
    // Some of what the sauce is made from is at home, but not all of it: shown as "Have some", still counted as missing.
    const partial = !have && !!made && made.lines.some(l => l.have && !l.always && !l.skipped); // water alone is not "some"
    return { ing, item, have, skipped, always, partial, suggest: item || skipped || always ? null : suggestItem(ing, g.items) };
  });
  const counted = lines.filter(l => !l.skipped);
  return { lines, have: counted.filter(l => l.have).length, total: counted.length };
}

/** The suggestions one tap can accept: the position of each unmatched ingredient and the item it would be pinned to. */
export const suggestionPins = (status: PantryStatus): { index: number; home: string }[] =>
  status.lines.flatMap((l, index) => (l.suggest ? [{ index, home: l.suggest.id }] : []));

/** What "Add missing to To get" works on: the ingredients that are not at home. One that is already an item on your list is on To get as it
 *  is (an item with no tick shows there), so it only counts; one with no item is a new name to add, once each by its words. */
export function missingParts(status: PantryStatus): { already: GroceryItem[]; add: string[] } {
  const already: GroceryItem[] = []; const add: string[] = []; const seen = new Set<string>();
  for (const l of status.lines) {
    if (l.have || l.skipped) continue;
    if (l.item) { if (!already.includes(l.item)) already.push(l.item); continue; }
    const name = ingredientName(l.ing);
    const key = [...nameWords(name)].sort().join(' ');
    if (key && !seen.has(key)) { seen.add(key); add.push(name); }
  }
  return { already, add };
}

/** What the status line says after "Add missing to To get": what was added, what was on To get already, and why an add was refused. */
export function addMissingMessage(r: { added: number; already: number; refused: string | null }): string {
  const parts = [
    r.added ? `Added ${r.added} to To get.` : '',
    r.already ? `${r.already} ${r.already === 1 ? 'is' : 'are'} on To get already.` : '',
    r.refused ?? '',
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Everything is at home.';
}
