import { FOOD_TYPES } from '../shared/recipes.js';
import type { FoodType, Recipe } from '../types.ts';

/* ---------- Food type (brief food-type-and-migration): Ingredient, Ready to eat or Drink on a ready-made food. Pure; the form, the review screen and the store call this. ---------- */

/** What a new ready-made food's Type starts on. */
export const DEFAULT_FOOD_TYPE: FoodType = 'ready';

/** The Type a form saves: the choice when it is a known type, else the default (the buttons only offer known ones). */
export const formFoodType = (v: unknown): FoodType => FOOD_TYPES.find(t => t === v) ?? DEFAULT_FOOD_TYPE;

// Name rules, a small list to change in one place. A word counts when it is a whole word of the name (so "oat" is not found inside "boat"); a drink word
// wins over an ingredient word ("egg nog", "oat milk"). Anything else is Ready to eat.
const DRINK = ['milk', 'kefir', 'juice', 'shake', 'smoothie', 'soda', 'water', 'coffee', 'tea', 'kombucha', 'lemonade', 'cola', 'beer', 'wine'];
const INGREDIENT = ['egg', 'eggs', 'flour', 'oats', 'oat', 'rice', 'banana', 'bananas', 'sugar', 'salt', 'butter', 'oil', 'honey', 'beans', 'lentils', 'onion', 'onions', 'garlic', 'potato', 'potatoes', 'apple', 'apples', 'spinach', 'broccoli', 'chicken breast', 'yogurt', 'cheese'];

const words = (name: string): string => ` ${name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
const hasWord = (text: string, w: string): boolean => text.includes(` ${w} `);

/** The Type the name suggests: Drink for milk, kefir, juice, shake and the like; Ingredient for egg, flour, oats, rice, banana and the like; else Ready to eat. */
export function suggestFoodType(name: string): FoodType {
  const t = words(name);
  if (DRINK.some(w => hasWord(t, w))) return 'drink';
  if (INGREDIENT.some(w => hasWord(t, w))) return 'ingredient';
  return 'ready';
}

/** A ready-made food that has no Type yet: the foods the review screen and the banner are about. */
export const isUntyped = (r: Recipe): boolean => r.cat === 'ready' && !r.type;
export const untypedFoods = (recipes: readonly Recipe[]): Recipe[] => recipes.filter(isUntyped);

/** The banner text, or null when nothing needs a Type. */
export function untypedBanner(recipes: readonly Recipe[]): string | null {
  const n = untypedFoods(recipes).length;
  return n ? `${n} ${n === 1 ? 'food needs' : 'foods need'} a type.` : null;
}

/** The kind a recipe counts as in the type tabs: its Type when set, an untyped ready-made food is Ready to eat, a drink recipe is a Drink, and any other recipe has none. */
export function foodTypeOf(r: Recipe): FoodType | null {
  if (r.cat === 'ready') return r.type ?? 'ready';
  return r.cat === 'drinks' ? 'drink' : null;
}

/** What "Looks right" saves: every untyped food with the Type its name suggests, overridden by any row the person changed (`picked`, by id). */
export function reviewChoices(recipes: readonly Recipe[], picked: Readonly<Record<string, FoodType>> = {}): Record<string, FoodType> {
  return Object.fromEntries(untypedFoods(recipes).map(r => [r.id, picked[r.id] ?? suggestFoodType(r.n)]));
}
