import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';
import type { Recipe } from '../types.ts';

// Meals built from foods (brief meals-from-foods): linking, the roll-up saved into the typed numbers, a part that is renamed, changed or deleted, loops, and the data file.
let useAppStore: typeof import('./useAppStore.js').useAppStore;
const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(async () => {
  clearStorage();
  const { normGrocery } = await import('../lib/grocery.js');
  useAppStore.setState({ grocery: normGrocery(null), groceryMonths: {}, recipes: [] });
});

const food = (n: string, kcal: number, p: number) => ({ n, cat: 'ready' as const, type: 'ingredient' as const, ing: [], steps: [], kcal, p });
const byName = (n: string): Recipe => st().recipes.find(r => r.n === n)!;
const bowl = () => ({ n: 'Cereal bowl', cat: 'breakfast' as const, ing: [{ n: 'Oat cereal', rid: byName('Oat cereal').id, q: 1.5 }, { n: 'Whole milk', rid: byName('Whole milk').id, q: 1 }], steps: [] });
const setup = () => { st().saveRecipe(food('Oat cereal', 150, 5)); st().saveRecipe(food('Whole milk', 150, 8)); };

describe('meals from foods', () => {
  it('saves the roll-up into kcal and p', () => {
    setup();
    expect(st().saveRecipe({ ...bowl(), kcal: 1, p: 1 })).toBeNull();
    expect(byName('Cereal bowl')).toMatchObject({ kcal: 375, p: 15.5 });
  });

  it('changing a food changes the meal on the next open', () => {
    setup(); st().saveRecipe(bowl());
    const oats = byName('Oat cereal');
    st().saveRecipe({ ...oats, kcal: 250 });
    expect(byName('Cereal bowl').kcal).toBe(525);
  });

  it('use my own numbers keeps the typed numbers while a part changes', () => {
    setup(); st().saveRecipe({ ...bowl(), own: true, kcal: 700, p: 40 });
    st().saveRecipe({ ...byName('Oat cereal'), kcal: 250 });
    expect(byName('Cereal bowl')).toMatchObject({ kcal: 700, p: 40, own: true });
  });

  it('deleting a linked food leaves the row as plain text and the meal recounts; renaming shows the new name', () => {
    setup(); st().saveRecipe(bowl());
    st().saveRecipe({ ...byName('Oat cereal'), n: 'Rolled oats' });
    expect(byName('Cereal bowl').ing[0]).toMatchObject({ n: 'Rolled oats', q: 1.5 });
    st().removeRecipe(byName('Whole milk').id);
    const meal = byName('Cereal bowl');
    expect(meal.ing[1]).toEqual({ n: 'Whole milk' });
    expect(meal.kcal).toBe(225);
  });

  it('Undo after deleting a food gives the meals that used it their links, amounts and numbers back', () => {
    setup(); st().saveRecipe(bowl());
    const before = JSON.stringify(byName('Cereal bowl'));
    st().removeRecipe(byName('Whole milk').id);
    expect(byName('Cereal bowl').ing[1]).toEqual({ n: 'Whole milk' });
    expect(st().removed!.restore()).toBe(true);
    expect(JSON.stringify(byName('Cereal bowl'))).toBe(before);
    expect(byName('Whole milk')).toBeDefined();
  });

  it('refuses a loop and a meal that holds itself', () => {
    setup(); st().saveRecipe(bowl());
    const meal = byName('Cereal bowl');
    st().saveRecipe({ n: 'Lunch box', cat: 'other', ing: [{ n: meal.n, rid: meal.id, q: 1 }], steps: [] });
    const box = byName('Lunch box');
    expect(st().saveRecipe({ ...meal, ing: [...meal.ing, { n: box.n, rid: box.id, q: 1 }] })).toMatch(/loop/);
    expect(st().saveRecipe({ ...meal, ing: [{ n: meal.n, rid: meal.id, q: 1 }] })).toMatch(/itself/);
    expect(byName('Cereal bowl').ing).toHaveLength(2);
  });

  it('a recipe with sauce links and typed numbers is saved and settled byte for byte as before', () => {
    st().saveRecipe({ n: 'Taco seasoning', cat: 'seasonings', ing: [{ n: 'cumin' }], steps: [] });
    const rid = byName('Taco seasoning').id;
    st().saveRecipe({ n: 'Tacos', cat: 'protein', ing: [{ n: 'Taco seasoning', amt: '2 tbsp', rid }], steps: [], kcal: 400, p: 30 });
    const before = JSON.stringify(byName('Tacos'));
    st().saveRecipe({ ...byName('Oat cereal') ?? food('Oats', 10, 1) });
    expect(JSON.stringify(byName('Tacos'))).toBe(before);
  });

  it('carries q and own out and back in through the data file', async () => {
    const { buildDataFile, normalizeData } = await import('../lib/export.js');
    setup(); st().saveRecipe({ ...bowl(), own: true, kcal: 400, p: 20 });
    const file = buildDataFile(st().snapshot(), {});
    const back = normalizeData(JSON.parse(JSON.stringify(file))).recipes!;
    expect(back).toEqual(file.recipes);
    expect(back.find(r => r.n === 'Cereal bowl')).toMatchObject({ own: true, ing: [{ q: 1.5 }, { q: 1 }] });
  });
});
