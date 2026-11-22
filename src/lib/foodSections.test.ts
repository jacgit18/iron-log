import { describe, expect, it } from 'vitest';
import type { FoodType, Recipe, RecipeCategory, RecipeUse } from '../types.ts';
import { RECIPE_CATEGORIES } from '../shared/recipes.js';
import { FOOD_GROUPS, FOOD_SECTIONS, alsoIn, alsoTag, firstSection, groupOf, inSection, inSectionList, openingSection, onFoodsList, searchCounts, sectionAfterSave, sectionEmptyNote, sectionForPath, sectionCountText, sectionCounts, sectionLabel, sectionsInGroup, sectionsOf } from './foodSections.js';

const mk = (id: string, cat: RecipeCategory, extra: Partial<Recipe> = {}): Recipe => ({ id, n: id, cat, ing: [], steps: [], ...extra });
const withSteps = ['mix'];

describe('sectionsOf: recipes', () => {
  it('puts a recipe with no steps in Meals and one with steps in Recipes, whatever its category', () => {
    for (const cat of RECIPE_CATEGORIES.filter(c => c !== 'ready')) {
      expect(sectionsOf(mk('a', cat))).toEqual(['meals']);
      expect(sectionsOf(mk('b', cat, { steps: withSteps }))).toEqual(['recipes']);
    }
  });
  it('moves a recipe only when its steps change', () => {
    const r = mk('a', 'protein');
    expect(sectionsOf(r)).toEqual(['meals']);
    expect(sectionsOf({ ...r, steps: withSteps })).toEqual(['recipes']);
    expect(sectionsOf({ ...r, steps: [] })).toEqual(['meals']);
  });
  it('keeps a sauce or drink recipe in Recipes and a step-less ingredient recipe in Meals, not in Store-bought', () => {
    expect(sectionsOf(mk('s', 'sauces', { steps: withSteps }))).toEqual(['recipes']);
    expect(sectionsOf(mk('d', 'drinks', { steps: withSteps, uses: ['drink'] }))).toEqual(['recipes']);
    expect(sectionsOf(mk('i', 'seasonings', { uses: ['ingredient'] }))).toEqual(['meals']);
  });
  it('is not changed by its Used as labels', () => {
    for (const uses of [['meal'], ['ingredient'], ['meal', 'ingredient'], ['drink']] as RecipeUse[][]) expect(sectionsOf(mk('a', 'sides', { steps: withSteps, uses }))).toEqual(['recipes']);
  });
});

describe('sectionsOf: ready-made foods', () => {
  const ready = (extra: Partial<Recipe> = {}) => mk('f', 'ready', extra);
  it('goes by Used as: Ingredients, Ready to eat or Drinks', () => {
    expect(sectionsOf(ready({ uses: ['ingredient'] }))).toEqual(['ingredients']);
    expect(sectionsOf(ready({ uses: ['ready'] }))).toEqual(['ready']);
    expect(sectionsOf(ready({ uses: ['drink'] }))).toEqual(['drinks']);
  });
  it('goes by its Type when it has no labels, and an untyped food is Ready to eat', () => {
    for (const [type, section] of [['ingredient', 'ingredients'], ['ready', 'ready'], ['drink', 'drinks']] as const) expect(sectionsOf(ready({ type: type as FoodType }))).toEqual([section]);
    expect(sectionsOf(ready())).toEqual(['ready']);
  });
  it('lists a two-use food in both sections (eggs: Ingredient and Ready to eat), once each', () => {
    expect(sectionsOf(ready({ uses: ['ready', 'ingredient'] }))).toEqual(['ingredients', 'ready']);
    expect(sectionsOf(ready({ uses: ['ingredient', 'ready'] }))).toEqual(['ingredients', 'ready']);
  });
  it('puts a ready-made food labelled only Meal in Ready to eat, never nowhere', () => {
    expect(sectionsOf(ready({ uses: ['meal'] }))).toEqual(['ready']);
    expect(sectionsOf(ready({ uses: ['meal', 'ingredient'] }))).toEqual(['ingredients']);
  });
  it('ignores steps on a ready-made food (it is never Meals or Recipes)', () => {
    expect(sectionsOf(ready({ steps: withSteps }))).toEqual(['ready']);
  });
});

describe('every item is in at least one section', () => {
  it('holds over every cat x uses x type x steps combination, and each section lists only what sectionsOf says', () => {
    const usesCases: (RecipeUse[] | undefined)[] = [undefined, ['meal'], ['ingredient'], ['ready'], ['drink'], ['meal', 'ingredient'], ['ready', 'ingredient']];
    const types: (FoodType | undefined)[] = [undefined, 'ingredient', 'ready', 'drink'];
    let n = 0;
    for (const cat of RECIPE_CATEGORIES) for (const uses of usesCases) for (const type of types) for (const steps of [[], withSteps]) {
      const r = mk('x', cat, { ...(uses ? { uses } : {}), ...(type ? { type } : {}), steps });
      const s = sectionsOf(r);
      expect(s.length).toBeGreaterThan(0);
      expect(new Set(s).size).toBe(s.length);
      for (const sec of FOOD_SECTIONS) expect(inSection(r, sec.key)).toBe((s as string[]).includes(sec.key));
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });
  it('never lists one of your recipes in Library', () => {
    expect(inSection(mk('a', 'protein'), 'library')).toBe(false);
    expect(inSectionList([mk('a', 'protein')], 'library')).toEqual([]);
  });
  it('lands a saved plate (no steps) in Meals', () => {
    expect(sectionsOf(mk('m', 'other', { fromMeal: 'sm1' }))).toEqual(['meals']);
  });
});

describe('sections and groups', () => {
  it('has six sections, Made first, with the labels the pills show', () => {
    expect(FOOD_SECTIONS.map(s => s.key)).toEqual(['meals', 'recipes', 'library', 'ingredients', 'ready', 'drinks']);
    expect(FOOD_SECTIONS.map(s => s.label)).toEqual(['Meals', 'Recipes', 'Library', 'Ingredients', 'Ready to eat', 'Drinks']);
    expect(FOOD_GROUPS.map(g => g.label)).toEqual(['Made', 'Store-bought']);
    expect(sectionLabel('ready')).toBe('Ready to eat');
  });
  it('groups them: Made is Meals, Recipes, Library; Store-bought is Ingredients, Ready to eat, Drinks', () => {
    expect(sectionsInGroup('made')).toEqual(['meals', 'recipes', 'library']);
    expect(sectionsInGroup('store')).toEqual(['ingredients', 'ready', 'drinks']);
    expect(groupOf('library')).toBe('made');
    expect(groupOf('drinks')).toBe('store');
  });
  it('names the other sections of a two-use food for its "also" tag', () => {
    const eggs = mk('e', 'ready', { uses: ['ready', 'ingredient'] });
    expect(alsoIn(eggs, 'ready')).toEqual(['Ingredients']);
    expect(alsoIn(eggs, 'ingredients')).toEqual(['Ready to eat']);
    expect(alsoIn(mk('m', 'protein'), 'meals')).toEqual([]);
  });
});

describe('counts', () => {
  const list = [mk('m1', 'protein'), mk('m2', 'carbs'), mk('r1', 'sauces', { steps: withSteps }), mk('eggs', 'ready', { uses: ['ready', 'ingredient'] }), mk('water', 'ready', { uses: ['drink'] }), mk('oil', 'ready', { uses: ['ingredient'] })];
  it('counts each section, a two-use food in both, and leaves Library blank until loaded', () => {
    expect(sectionCounts(list)).toEqual({ meals: 2, recipes: 1, ingredients: 2, ready: 1, drinks: 1, library: null, plus: false });
    expect(sectionCountText('library', sectionCounts(list))).toBe('');
    expect(sectionCountText('meals', sectionCounts(list))).toBe('2');
  });
  it('shows the Library count with a plus while more pages exist', () => {
    expect(sectionCountText('library', sectionCounts(list, 12, true))).toBe('12+');
    expect(sectionCountText('library', sectionCounts(list, 12, false))).toBe('12');
    expect(sectionCountText('meals', sectionCounts(list, 12, true))).toBe('2'); // only Library is "at least"
    expect(sectionCountText('library', sectionCounts(list, 0, false))).toBe('0');
  });
  it('counts an empty list as zeros', () => expect(sectionCounts([])).toMatchObject({ meals: 0, recipes: 0, ingredients: 0, ready: 0, drinks: 0 }));
  it('searchCounts counts the matches per section and each item once per group', () => {
    const c = searchCounts(list, 3);
    expect(c.sections).toMatchObject({ meals: 2, ingredients: 2, ready: 1, library: 3 });
    expect(c.groups).toEqual({ made: 3 + 3, store: 3 }); // eggs is one Store-bought match, not two
    expect(searchCounts(list).groups.made).toBe(3);
  });
  it('searchCounts marks the Made number "at least" while more library pages exist or the library is not loaded', () => {
    expect(searchCounts(list, 3, true).madePlus).toBe(true);
    expect(searchCounts(list).madePlus).toBe(true);
    expect(searchCounts(list, 3, false).madePlus).toBe(false);
  });
  it('searchCounts of no match is zero everywhere', () => {
    expect(searchCounts([], 0).groups).toEqual({ made: 0, store: 0 });
  });
});

describe('opening section', () => {
  it('opens the first of Meals, Recipes, Ready to eat that has an item', () => {
    expect(firstSection([mk('a', 'protein'), mk('b', 'ready')])).toBe('meals');
    expect(firstSection([mk('a', 'protein', { steps: withSteps }), mk('b', 'ready')])).toBe('recipes');
    expect(firstSection([mk('b', 'ready')])).toBe('ready');
  });
  it('skips Ingredients and Drinks when Ready to eat is empty, and falls back to Meals with nothing', () => {
    expect(firstSection([mk('oil', 'ready', { uses: ['ingredient'] })])).toBe('meals');
    expect(firstSection([])).toBe('meals');
  });
  it('prefers the section last used this visit', () => {
    expect(openingSection('drinks', [mk('a', 'protein')])).toBe('drinks');
    expect(openingSection('library', [])).toBe('library');
    expect(openingSection(null, [mk('a', 'protein')])).toBe('meals');
  });
  it('returns an item to the section it belongs in after Save', () => {
    expect(sectionAfterSave(mk('a', 'protein', { steps: withSteps }))).toBe('recipes');
    expect(sectionAfterSave(mk('a', 'protein'))).toBe('meals');
    const eggs = mk('e', 'ready', { uses: ['ready', 'ingredient'] });
    expect(sectionAfterSave(eggs)).toBe('ingredients');
    expect(sectionAfterSave(eggs, 'ready')).toBe('ready'); // a two-use food goes back to where it was opened
    expect(sectionAfterSave(mk('a', 'protein'), 'drinks')).toBe('meals'); // not a section it is in
  });
});

describe('sectionEmptyNote', () => {
  it('says what to do in each section, and that a recipe with no steps is a meal under Meals', () => {
    for (const s of FOOD_SECTIONS) expect(sectionEmptyNote(s.key, false).length).toBeGreaterThan(10);
    expect(sectionEmptyNote('meals', false)).toMatch(/no steps/);
    expect(sectionEmptyNote('recipes', true)).toMatch(/Clear the search/);
  });
});

describe('sectionForPath and onFoodsList', () => {
  const list = [mk('a', 'protein', { steps: withSteps })];
  it('reads the section from its address, a library page address and nothing else', () => {
    expect(sectionForPath('daily/recipes/drinks', 'meals', list)).toEqual({ section: 'drinks', fix: null });
    expect(sectionForPath('daily/recipes/library/item', null, list)).toEqual({ section: 'library', fix: null });
  });
  it('rewrites the bare address to the last section used, else the first with an item', () => {
    expect(sectionForPath('daily/recipes', 'ingredients', list)).toEqual({ section: 'ingredients', fix: 'daily/recipes/ingredients' });
    expect(sectionForPath('daily/recipes', null, list)).toEqual({ section: 'recipes', fix: 'daily/recipes/recipes' });
    expect(sectionForPath('daily/recipes', null, [])).toEqual({ section: 'meals', fix: 'daily/recipes/meals' });
  });
  it('leaves a page address alone and shows the last section behind it', () => {
    expect(sectionForPath('daily/recipes/mine', 'ready', list)).toEqual({ section: 'ready', fix: null });
  });
  it('is the list only for the bare address and a section address', () => {
    expect(['daily/recipes', 'daily/recipes/meals', 'daily/recipes/library'].every(onFoodsList)).toBe(true);
    expect(['daily/recipes/mine', 'daily/recipes/form', 'daily/recipes/library/item', 'daily/recipes/types'].some(onFoodsList)).toBe(false);
  });
});

describe('alsoTag', () => {
  it('names the other use of a two-use food, singular, and nothing for a food listed once', () => {
    const eggs = mk('e', 'ready', { type: 'ready', uses: ['ingredient', 'ready'] });
    expect(alsoTag(eggs, 'ingredients')).toBe('also Ready to eat');
    expect(alsoTag(eggs, 'ready')).toBe('also Ingredient');
    expect(alsoTag(mk('m', 'ready', { type: 'drink' }), 'drinks')).toBe('');
    expect(alsoTag(mk('r', 'protein', { steps: withSteps }), 'recipes')).toBe('');
  });
});

describe('searchCounts: the Made number is exact only when the library cannot add to it', () => {
  it('is "at least" while the library is unknown or has more pages, exact when it is known to add nothing more', () => {
    const list = [mk('a', 'protein', { steps: withSteps })];
    expect(searchCounts(list, null).madePlus).toBe(true);
    expect(searchCounts(list, 3, true).madePlus).toBe(true);
    expect(searchCounts(list, 0, false)).toMatchObject({ madePlus: false, groups: { made: 1, store: 0 } }); // signed out: Recipes.tsx passes 0
  });
});
