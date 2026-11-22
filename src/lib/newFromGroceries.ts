import { MAX_RECIPES } from '../shared/recipes.js';
import type { FoodType, GroceryItem, Recipe } from '../types.ts';
import { foodIdFor, madeFood, planFoodForItem } from './foodFromItem.js';
import { suggestFoodType } from './foodType.js';

/* ---------- The "new from groceries" row (brief groceries-make-foods): which Foods wait for a look, what the sweep would make, when Undo may take a Food back. Pure. ---------- */

export const TYPE_CHOICES: readonly { key: FoodType; label: string }[] = [{ key: 'ingredient', label: 'Ingredient' }, { key: 'ready', label: 'Ready to eat' }, { key: 'drink', label: 'Drink' }];
export const typeLabel = (t: FoodType | undefined): string => TYPE_CHOICES.find(c => c.key === (t ?? 'ready'))!.label;

/** The Foods made from the grocery list and not confirmed yet. */
export const waitingFoods = (recipes: readonly Recipe[]): Recipe[] => recipes.filter(r => r.fromGroc === true);

/** The pill's text, or null when none wait. */
export const pillText = (n: number): string | null => (n ? `${n} new from groceries` : null);

/** A Food with the type the person picked (its labels follow the type), and nothing else changed. */
export function withFoodType(r: Recipe, type: FoodType): Recipe {
  const { uses: _u, ...rest } = r;
  return { ...rest, type };
}

/** Looks right: the marker goes off the given Foods (all waiting ones when `ids` is left out). */
export function confirmed(recipes: readonly Recipe[], ids?: readonly string[]): Recipe[] {
  const pick = ids ? new Set(ids) : null;
  return recipes.map(r => { if (!r.fromGroc || (pick && !pick.has(r.id))) return r; const { fromGroc: _f, ...rest } = r; return rest; });
}

/** Equal whatever the key order (a synced copy can come back with its keys in another order). */
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, canon(x)])) : v);
const sameShape = (a: Recipe, b: Recipe): boolean => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** Whether Undo of the add may take the Food back: still flagged, exactly as it was made (no type change, edit, number or star), and nothing refers to it (`referenced`: planned, logged, repeated, snacked, in a meal or paired). */
export function untouchedFood(food: Recipe, item: Pick<GroceryItem, 'id' | 'n'>, referenced: boolean): boolean {
  return food.fromGroc === true && !referenced && sameShape(food, madeFood(item, food.id));
}

export interface Candidate { item: GroceryItem; type: FoodType }
export interface Sweep { make: Recipe[]; candidates: Candidate[]; waiting: number }

/** What "Make Foods from my existing items" would write: a Food for every list item (not one-time) that matches no Food, up to the room left under the cap (and only the items in `only`, when given: the ones ticked in the preview); `waiting` items had no room. `candidates` is every such item with its guessed type, for the preview. */
export function sweepFoods(items: readonly GroceryItem[], recipes: readonly Recipe[], only?: ReadonlySet<string>): Sweep {
  const all: Candidate[] = [];
  const make: Recipe[] = [];
  const ids = recipes.map(r => r.id);
  for (const item of items) {
    const p = planFoodForItem(item, [...recipes, ...make]); // an earlier item's new Food counts: the same name in two stores is one Food
    if (p.kind !== 'make' && !(p.kind === 'skip' && p.reason === 'full')) continue;
    all.push({ item, type: suggestFoodType(item.n) });
    if (only && !only.has(item.id)) continue; // not ticked in the preview: stays a candidate, makes no Food
    if (recipes.length + make.length >= MAX_RECIPES) continue;
    const food = madeFood(item, foodIdFor(item.id, ids));
    ids.push(food.id); make.push(food);
  }
  return { make, candidates: all, waiting: all.filter(c => (only ? only.has(c.item.id) : true)).length - make.length };
}

/** What can point at a Food: the log, the plan, repeats, snacks, saved meals, and other recipes (a meal line or a pairing). */
export interface FoodRefs { entries: readonly { from?: string }[]; diet?: import('../types.ts').DietCfg | undefined; recipes: readonly Recipe[] }

/** Whether anything refers to the Food (planned, logged, repeated, a snack, in a meal or paired): then Undo of the add leaves it. */
export function isFoodReferenced(id: string, refs: FoodRefs): boolean {
  const d = refs.diet;
  return refs.entries.some(e => e.from === id)
    || Object.values(d?.plan ?? {}).some(day => day.some(p => p.k === 'r' && p.id === id))
    || (d?.repeats ?? []).some(r => r.k === 'r' && r.id === id)
    || (d?.snacks ?? []).some(s => s.id === id)
    || (d?.meals ?? []).some(m => m.items.some(i => i.from === id))
    || refs.recipes.some(r => r.id !== id && (r.pairs?.includes(id) || r.ing.some(i => i.rid === id)));
}
