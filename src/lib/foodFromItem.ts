import { MAX_RECIPES } from '../shared/recipes.js';
import type { GroceryItem, Recipe } from '../types.ts';
import { aliasKey } from './groceryAliases.js';
import { savedFromUses, suggestUses } from './foodType.js';
import { matchHome, nameWords } from './recipePantry.js';

/* ---------- Groceries make Foods (brief groceries-make-foods): the Food a new grocery item gets, or the Food it links to. Pure; the store's addGroceryItem calls it. ---------- */

/** One constant turns auto-create off without touching data. */
export const GROCERY_FOODS_ON = true;

export type FoodPlan = { kind: 'link'; id: string } | { kind: 'make'; food: Recipe } | { kind: 'skip'; reason: 'one-time' | 'full' };

/** Whether a ready-made Food is this item: its pin to the item, else (when it has no pin of its own) the same name by the At home name rules, else a receipt name of the item equal to the Food's name. A recipe or meal is never a store-bought item. */
export function isFoodOfItem(r: Recipe, item: GroceryItem): boolean {
  if (r.cat !== 'ready') return false;
  if (r.home) return r.home === item.id;
  return matchHome({ n: r.n }, [item]) !== null || !!item.aliases?.some(a => aliasKey(a) === aliasKey(r.n));
}

const sameWords = (a: string, b: string): boolean => nameWords(a).join(' ') === nameWords(b).join(' ');

/** The Food an item already has: its pinned Food first, else a name match, else a Food with exactly its name that is pinned to another item (the same food bought in two stores is one Food). */
export function foodOfItem(item: GroceryItem, recipes: readonly Recipe[]): Recipe | undefined {
  return recipes.find(r => r.cat === 'ready' && r.home === item.id) ?? recipes.find(r => isFoodOfItem(r, item)) ?? recipes.find(r => r.cat === 'ready' && sameWords(r.n, item.n));
}

/** `g-<item id>`, or the first free `g-<item id>-2`, `-3`... when another recipe holds it. */
export function foodIdFor(itemId: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `g-${itemId}`;
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** The Food an item makes: named as the item is, a guessed type, no nutrition, pinned to the item, flagged until the person says it looks right. */
export function madeFood(item: Pick<GroceryItem, 'id' | 'n'>, id: string): Recipe {
  return { id, n: item.n, cat: 'ready', ...savedFromUses(suggestUses(item.n)), home: item.id, fromGroc: true, ing: [], steps: [] };
}

/** What adding `item` does to Foods: link the Food it matches, make one, or make none (a one-time item, or Foods is full). */
export function planFoodForItem(item: GroceryItem, recipes: readonly Recipe[]): FoodPlan {
  if (item.oneTime) return { kind: 'skip', reason: 'one-time' };
  const have = foodOfItem(item, recipes);
  if (have) return { kind: 'link', id: have.id };
  if (recipes.length >= MAX_RECIPES) return { kind: 'skip', reason: 'full' };
  return { kind: 'make', food: madeFood(item, foodIdFor(item.id, recipes.map(r => r.id))) };
}

/** The words after an add: the Food it made, or why none was made. Empty when nothing needs saying (a link, a one-time item). */
export function foodNoticeText(item: GroceryItem, recipes: readonly Recipe[]): string {
  if (item.oneTime) return '';
  const made = recipes.find(r => r.fromGroc && r.home === item.id);
  if (made) return `Made a Food: ${made.type === 'ingredient' ? 'Ingredient' : made.type === 'drink' ? 'Drink' : 'Ready to eat'}.`;
  return !foodOfItem(item, recipes) && recipes.length >= MAX_RECIPES ? `Foods is full (${MAX_RECIPES}): its Food waits.` : '';
}

/** The words a receipt's Applied notice adds for the items it created: "Made 2 Foods." (empty when none was made). */
export function madeFoodsText(itemIds: readonly string[], recipes: readonly Recipe[]): string {
  const ids = new Set(itemIds);
  const n = recipes.filter(r => r.fromGroc && r.home && ids.has(r.home)).length;
  return n ? ` Made ${n} ${n === 1 ? 'Food' : 'Foods'}.` : '';
}
