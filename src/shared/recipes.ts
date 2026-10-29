import type { Recipe, RecipeCategory, RecipeIngredient } from '../types.ts';
import { reservedId } from './grocery.js';
import { str } from './stretchWeek.js';

/* ---------- Recipe shape: one recipe of your own (ADR 084) ----------
   The cleaning rules for a recipe, shared by the app and the API so the server holds what the app would. `normRecipe` takes anything and
   returns the clean recipe (or null when it can't be used); `validRecipe` is stricter and says whether a value is already clean, for the
   API to refuse what the app would never send. Same split as the grocery list (src/shared/grocery.ts). */

export const MAX_RECIPES = 300, MAX_INGREDIENTS = 40, MAX_STEPS = 40;
export const MAX_RECIPE_ID = 60, MAX_RECIPE_NAME = 80, MAX_AMOUNT = 40, MAX_STEP = 500, MAX_NOTE = 300, MAX_FROM = 100;

export const RECIPE_CATEGORIES: readonly RecipeCategory[] = ['protein', 'sides', 'sauces', 'seasonings', 'drinks', 'breakfast', 'dessert', 'other'];
/** How a category reads on a chip and in a pill. */
export const RECIPE_CATEGORY_LABEL: Record<RecipeCategory, string> = { protein: 'Protein', sides: 'Sides', sauces: 'Sauces', seasonings: 'Seasonings', drinks: 'Drinks', breakfast: 'Breakfast', dessert: 'Dessert', other: 'Other' };

const cleanCategory = (v: unknown): RecipeCategory => RECIPE_CATEGORIES.find(c => c === v) ?? 'other';
const cleanWhole = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : null);

/** One ingredient line, or null when it has no name. */
export function normIngredient(x: unknown): RecipeIngredient | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const n = str(o.n, MAX_RECIPE_NAME), amt = str(o.amt, MAX_AMOUNT), home = str(o.home, MAX_RECIPE_ID);
  return n ? { n, ...(amt ? { amt } : {}), ...(home && !reservedId(home) ? { home } : {}) } : null;
}

/** One recipe, cleaned: lists are capped, blank lines dropped, an unknown category becomes Other. Null without an id or a name. */
export function normRecipe(x: unknown): Recipe | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const id = str(o.id, MAX_RECIPE_ID), n = str(o.n, MAX_RECIPE_NAME);
  if (!id || !n || reservedId(id)) return null;
  const ing = (Array.isArray(o.ing) ? o.ing : []).map(normIngredient).filter((i): i is RecipeIngredient => !!i).slice(0, MAX_INGREDIENTS);
  const steps = (Array.isArray(o.steps) ? o.steps : []).map(s => str(s, MAX_STEP)).filter(Boolean).slice(0, MAX_STEPS);
  const servings = cleanWhole(o.servings, 99), minutes = cleanWhole(o.minutes, 1440);
  const note = str(o.note, MAX_NOTE), from = str(o.from, MAX_FROM);
  return { id, n, cat: cleanCategory(o.cat), ing, steps, ...(servings ? { servings } : {}), ...(minutes ? { minutes } : {}), ...(note ? { note } : {}), ...(from.startsWith('c:') ? { from } : {}) };
}

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => k in b && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};
/** Whether `v` is a recipe exactly as the app writes one (the API refuses anything else). */
export const validRecipe = (v: unknown): v is Recipe => { const c = normRecipe(v); return c !== null && same(c, v); };
