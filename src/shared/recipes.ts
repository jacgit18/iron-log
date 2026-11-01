import type { Recipe, RecipeCategory, RecipeChips, RecipeIngredient } from '../types.ts';
import { cleanGrams, cleanKcal, cleanProtein } from './diet.js';
import { reservedId } from './grocery.js';
import { same } from './same.js';
import { str } from './stretchWeek.js';

/* ---------- Recipe shape: one recipe of your own (ADR 084) ----------
   The cleaning rules for a recipe, shared by the app and the API so the server holds what the app would. `normRecipe` takes anything and
   returns the clean recipe (or null when it can't be used); `validRecipe` is stricter and says whether a value is already clean, for the
   API to refuse what the app would never send. Same split as the grocery list (src/shared/grocery.ts). */

export const MAX_RECIPES = 300, MAX_INGREDIENTS = 40, MAX_STEPS = 40;
export const MAX_TAG = 24, MAX_TAGS_PER_RECIPE = 8, MAX_TAGS = 30; // custom filter tags (brief recipe-filter-editing): name length, per recipe, different tags in all
export const MAX_RECIPE_ID = 60, MAX_RECIPE_NAME = 80, MAX_AMOUNT = 40, MAX_STEP = 500, MAX_NOTE = 300, MAX_FROM = 100, MAX_SERVING = 40, MAX_SERVING_G = 5000, MAX_URL = 500; // MAX_URL: a video link on a recipe (brief recipe-video-link)

export const RECIPE_CATEGORIES: readonly RecipeCategory[] = ['protein', 'carbs', 'sides', 'sauces', 'seasonings', 'drinks', 'breakfast', 'dessert', 'ready', 'other'];
/** How a category reads on a chip and in a pill. */
export const RECIPE_CATEGORY_LABEL: Record<RecipeCategory, string> = { protein: 'Protein', carbs: 'Carbs', sides: 'Sides', sauces: 'Sauces', seasonings: 'Seasonings', drinks: 'Drinks', breakfast: 'Breakfast', dessert: 'Dessert', ready: 'Ready-made', other: 'Other' };

/** The tags of one recipe, cleaned: spaces collapsed, cut to MAX_TAG, repeats (any case) dropped keeping the first spelling, at most MAX_TAGS_PER_RECIPE. */
export function normTags(v: unknown): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const t of Array.isArray(v) ? v : []) {
    const tag = str(typeof t === 'string' ? t.replace(/\s+/g, ' ') : '', MAX_TAG), k = tag.toLowerCase();
    if (tag && !seen.has(k)) { seen.add(k); out.push(tag); }
  }
  return out.slice(0, MAX_TAGS_PER_RECIPE);
}

/** The recipe chip setting, cleaned: known categories only, no repeats; null when nothing is left to keep. */
export function normRecipeChips(v: unknown): RecipeChips | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const cats = (x: unknown) => [...new Set((Array.isArray(x) ? x : []).filter((c): c is RecipeCategory => RECIPE_CATEGORIES.includes(c as RecipeCategory)))];
  const hide = cats(o.hide), order = cats(o.order);
  return hide.length || order.length ? { ...(hide.length ? { hide } : {}), ...(order.length ? { order } : {}) } : null;
}

const cleanCategory = (v: unknown): RecipeCategory => RECIPE_CATEGORIES.find(c => c === v) ?? 'other';
const cleanWhole = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : null);

/** One ingredient line, or null when it has no name. */
export function normIngredient(x: unknown): RecipeIngredient | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const n = str(o.n, MAX_RECIPE_NAME), amt = str(o.amt, MAX_AMOUNT), home = str(o.home, MAX_RECIPE_ID), rid = str(o.rid, MAX_RECIPE_ID), sub = str(o.sub, MAX_RECIPE_NAME);
  return n ? { n, ...(amt ? { amt } : {}), ...(home && !reservedId(home) ? { home } : {}), ...(rid && !reservedId(rid) ? { rid } : {}), ...(sub && sub.toLowerCase() !== n.toLowerCase() ? { sub } : {}), ...(o.skip === true ? { skip: true as const } : {}) } : null;
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
  const serving = str(o.serving, MAX_SERVING), servingG = cleanWhole(o.servingG, MAX_SERVING_G); // what one serving is: words and/or grams (brief recipe-serving-size)
  const note = str(o.note, MAX_NOTE), from = str(o.from, MAX_FROM);
  const urlText = typeof o.url === 'string' ? o.url.trim() : '', url = urlText.length <= MAX_URL && /^https?:\/\/\S+$/i.test(urlText) ? urlText : ''; // only a web link, cut never (a cut address would not open): a script or file address never becomes a link
  const library = from.startsWith('c:');
  const tags = normTags(o.tags);
  const kcal = cleanKcal(o.kcal), p = cleanProtein(o.p), c = cleanGrams(o.c), f = cleanGrams(o.f); // calories, protein, carbs and fat (g) per serving, typed by the person (ADR 086)
  return { id, n, cat: cleanCategory(o.cat), ...(tags.length ? { tags } : {}), ing, steps, ...(servings ? { servings } : {}), ...(serving ? { serving } : {}), ...(servingG ? { servingG } : {}), ...(minutes ? { minutes } : {}), ...(kcal !== null ? { kcal } : {}), ...(p !== null ? { p } : {}), ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}), ...(note ? { note } : {}), ...(url ? { url } : {}), ...(library ? { from } : {}), ...(library && o.edited === true ? { edited: true as const } : {}) };
}

/** Whether `v` is a recipe exactly as the app writes one (the API refuses anything else). */
export const validRecipe = (v: unknown): v is Recipe => { const c = normRecipe(v); return c !== null && same(c, v); };

/** The recipes of a stored list, cleaned: the unusable and repeated ones dropped, at most MAX_RECIPES. */
export function normRecipes(items: unknown): Recipe[] {
  const seen = new Set<string>();
  const list = (Array.isArray(items) ? items : []).map(normRecipe).filter((r): r is Recipe => !!r && !seen.has(r.id) && !!seen.add(r.id)).slice(0, MAX_RECIPES);
  // At most MAX_TAGS different tags in all (any case): a tag past the limit is dropped, the earlier ones keep their spelling.
  const kept = new Map<string, string>();
  return list.map(r => {
    if (!r.tags) return r;
    const tags = r.tags.flatMap(t => { const k = t.toLowerCase(); if (!kept.has(k) && kept.size < MAX_TAGS) kept.set(k, t); return kept.has(k) ? [kept.get(k)!] : []; });
    const { tags: _t, ...rest } = r;
    return tags.length ? { ...rest, tags } : rest;
  });
}
