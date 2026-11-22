import type { Recipe } from '../types.ts';
import { FOOD_SECTION_KEYS, foodSectionOf, foodSectionPath, type FoodSectionKey } from './route.js';
import { usesOf } from './recipeUses.js';

/* ---------- Foods sections (brief foods-made-and-store-bought): Made (Meals, Recipes, Library) and Store-bought (Ingredients, Ready to eat, Drinks).
   Derived from `cat`, `uses`, `type` and `steps`; nothing is stored. Pure; the Foods screen only draws it. ---------- */

export type FoodSection = FoodSectionKey;
export type FoodGroup = 'made' | 'store';
/** A section that lists your own recipes and foods (Library lists the shared catalog, which is not a Recipe). */
export type OwnSection = Exclude<FoodSection, 'library'>;

export const FOOD_GROUPS = [{ key: 'made', label: 'Made' }, { key: 'store', label: 'Store-bought' }] as const satisfies readonly { key: FoodGroup; label: string }[];

const META: Readonly<Record<FoodSection, { label: string; group: FoodGroup }>> = {
  meals: { label: 'Meals', group: 'made' },
  recipes: { label: 'Recipes', group: 'made' },
  library: { label: 'Library', group: 'made' },
  ingredients: { label: 'Ingredients', group: 'store' },
  ready: { label: 'Ready to eat', group: 'store' },
  drinks: { label: 'Drinks', group: 'store' },
};

/** The sections in the order the pills show them: Made first, then Store-bought. */
export const FOOD_SECTIONS: readonly { key: FoodSection; label: string; group: FoodGroup }[] = FOOD_SECTION_KEYS.map(key => ({ key, ...META[key] }));
export const sectionLabel = (s: FoodSection): string => META[s].label;
export const groupOf = (s: FoodSection): FoodGroup => META[s].group;
export const sectionsInGroup = (g: FoodGroup): FoodSection[] => FOOD_SECTION_KEYS.filter(k => META[k].group === g);

const STORE_SECTION = { ingredient: 'ingredients', ready: 'ready', drink: 'drinks' } as const;

/** Every own section a recipe or food is listed in (never Library, never empty). A recipe is Meals when it has no steps (a combo or a saved plate), else Recipes, whatever it is used as.
 *  A ready-made food goes by its labels, one section each (eggs: Ingredients and Ready to eat); a ready-made food with only a Meal label is Ready to eat, so nothing is lost. */
export function sectionsOf(r: Pick<Recipe, 'cat' | 'type' | 'uses' | 'steps'>): OwnSection[] {
  if (r.cat !== 'ready') return [r.steps.length === 0 ? 'meals' : 'recipes'];
  const out = [...new Set(usesOf(r).flatMap(u => (u === 'meal' ? [] : [STORE_SECTION[u]])))];
  return out.length ? out : ['ready'];
}

/** Whether a recipe or food is listed in a section. Library holds no recipe of yours. */
export const inSection = (r: Pick<Recipe, 'cat' | 'type' | 'uses' | 'steps'>, s: FoodSection): boolean => s !== 'library' && (sectionsOf(r) as FoodSection[]).includes(s);

/** The recipes and foods of one section, in the order given (none for Library, which lists the catalog instead). */
export const inSectionList = (list: readonly Recipe[], s: FoodSection): Recipe[] => list.filter(r => inSection(r, s));

/** The small "also Ready to eat" tag of a two-use food: the other sections it is listed in, as words (empty for a food listed once). */
export const alsoIn = (r: Pick<Recipe, 'cat' | 'type' | 'uses' | 'steps'>, s: FoodSection): string[] => sectionsOf(r).filter(x => x !== s).map(sectionLabel);

/** How many items each section holds. `library` is null until the library has loaded once, and `plus` is true while more library pages can be loaded (the count is "at least"). */
export interface SectionCounts { meals: number; recipes: number; ingredients: number; ready: number; drinks: number; library: number | null; plus: boolean }

/** Count `list` per section (pass the list the filters and the search already narrowed). A two-use food counts in both of its sections. */
export function sectionCounts(list: readonly Recipe[], library: number | null = null, more = false): SectionCounts {
  const c: SectionCounts = { meals: 0, recipes: 0, ingredients: 0, ready: 0, drinks: 0, library, plus: library !== null && more };
  for (const r of list) for (const s of sectionsOf(r)) c[s]++;
  return c;
}

/** A pill's number as text: "12", "12+" for a library with more pages, "" while the library is unknown. */
export function sectionCountText(s: FoodSection, c: SectionCounts): string {
  const n = c[s];
  if (n === null) return '';
  return s === 'library' && c.plus ? `${n}+` : String(n);
}

/** `madePlus` is true when the Made number is "at least": more library pages exist, or the library has not loaded yet (so it is not in the number). */
export interface SearchCounts { sections: SectionCounts; groups: Record<FoodGroup, number | null>; madePlus: boolean }

/** The numbers while a search is typed. `matches` is your own list narrowed by the search (and the filters), `libraryMatches` the library rows that match (null until loaded).
 *  A group counts each item once, so a food listed in two Store-bought sections is one match on the Store-bought button. */
export function searchCounts(matches: readonly Recipe[], libraryMatches: number | null = null, more = false): SearchCounts {
  const sections = sectionCounts(matches, libraryMatches, more);
  const made = matches.filter(r => sectionsOf(r).some(s => groupOf(s) === 'made')).length;
  const store = matches.filter(r => sectionsOf(r).some(s => groupOf(s) === 'store')).length;
  return { sections, groups: { made: libraryMatches === null ? made : made + libraryMatches, store }, madePlus: libraryMatches === null || more };
}

/** The sections tried, in order, when no section was used yet this visit. */
export const OPENING_ORDER: readonly OwnSection[] = ['meals', 'recipes', 'ready'];

/** The first of Meals, Recipes, Ready to eat that has an item; with none, Meals (its empty note says what to do). */
export const firstSection = (list: readonly Recipe[]): FoodSection => OPENING_ORDER.find(s => list.some(r => inSection(r, s))) ?? 'meals';

/** The section a bare Foods address opens: the last one used this visit, else the first with an item. */
export const openingSection = (last: FoodSection | null, list: readonly Recipe[]): FoodSection => last ?? firstSection(list);

/** The section an item belongs in after Save: the first of its sections (a two-use food returns to the section it was opened from when that is one of them). */
export function sectionAfterSave(r: Pick<Recipe, 'cat' | 'type' | 'uses' | 'steps'>, from: FoodSection | null = null): OwnSection {
  const all = sectionsOf(r);
  return from && (all as FoodSection[]).includes(from) ? (from as OwnSection) : all[0];
}

/** What an empty section says to do. `searching` is a typed search or an active filter. */
export function sectionEmptyNote(s: FoodSection, searching: boolean): string {
  if (searching) return 'Nothing in this section matches. Clear the search or the filters, or pick another section.';
  switch (s) {
    case 'meals': return 'No meals yet. A meal is made from foods you already have, with no steps (a recipe with no steps is a meal). Use + New, then Recipe or meal.';
    case 'recipes': return 'No recipes yet. Use + New, then Recipe or meal, or find one in Library.';
    case 'ingredients': return 'No ingredients yet. Use + New, then Scan to fill a food form or Add a food by hand, and mark it as an Ingredient.';
    case 'ready': return 'No ready-to-eat foods yet. Use + New, then Add a food by hand.';
    case 'drinks': return 'No drinks yet. Use + New, then Add a food by hand and press Drink.';
    case 'library': return 'Everything here is already in your recipes.';
  }
}

/** Which section the Foods screen shows for an address, and where to rewrite the address when it should name one. A section's own address (or a page opened from it) wins;
 *  otherwise the section last used this visit, else the first with an item. `fix` is set only for the bare address, which is rewritten to the section's own. */
export function sectionForPath(path: string, last: FoodSection | null, list: readonly Recipe[]): { section: FoodSection; fix: string | null } {
  const section = foodSectionOf(path) ?? openingSection(last, list);
  return { section, fix: path === 'daily/recipes' ? foodSectionPath(section) : null };
}

/** Whether the address is the Foods list itself: bare, or a section's own address (not a page like `mine`, `form` or `library/item`). */
export const onFoodsList = (path: string): boolean => path === 'daily/recipes' || FOOD_SECTION_KEYS.some(k => path === foodSectionPath(k));
