import { describe, expect, it } from 'vitest';
import { normRecipe } from '../../src/shared/recipes.ts';
import { moveMeals } from '../../src/lib/quickMeals.ts';
import { mealItems } from '../../src/lib/quickMeals.ts';
import type { Recipe, SavedMeal } from '../../src/types.ts';
import { personaById } from './personas.ts';
import { buildPersonaRows } from './seedPlan.ts';

// The seed gives a tester something to start from for Goes with, Counts as and the saved-meals move (briefs recipes-goes-with, week-board, saved-meals-into-recipes).
const today = new Date(2026, 10, 8);
const rows = (id: string) => buildPersonaRows(personaById(id)!, [], today);
const recipesOf = (id: string): Recipe[] => rows(id).recipes.map(r => normRecipe(r.data)!);

describe('QA seed: Goes with and Counts as', () => {
  it('pairs Chicken and rice bowl and Baked salmon with Tuna salad on the recipe collector, on both sides, with valid ids', () => {
    const list = recipesOf('recipe-collector'), by = (n: string) => list.find(r => r.n === n)!;
    expect(by('Chicken and rice bowl').pairs).toEqual([by('Tuna salad').id]);
    expect(by('Baked salmon').pairs).toEqual([by('Tuna salad').id]);
    expect(by('Tuna salad').pairs).toEqual([by('Chicken and rice bowl').id, by('Baked salmon').id]);
    for (const r of list) for (const p of r.pairs ?? []) expect(list.some(x => x.id === p), `${r.n} pairs with a real recipe`).toBe(true);
  });
  it('sets Lentil soup to count as Protein and Carb by hand', () => {
    expect(recipesOf('recipe-collector').find(r => r.n === 'Lentil soup')!.counts).toEqual(['protein', 'carb']);
  });
});

describe('QA seed: saved meals move into Recipes', () => {
  const planner = () => {
    const cfg = rows('meal-planner').config!.diet as { meals: SavedMeal[] };
    return { meals: cfg.meals, recipes: recipesOf('meal-planner') };
  };
  it('moves all four saved meals, once, and links Usual breakfast to its two recipes', () => {
    const { meals, recipes } = planner();
    const moved = moveMeals(meals, {}, recipes);
    expect(moved.added).toBe(4);
    const made = (n: string) => moved.recipes.find(r => r.n === n)!;
    expect(made('Usual breakfast').ing.map(i => i.rid)).toEqual([recipes[0]!.id, recipes[1]!.id]);
    expect(mealItems(made('Usual breakfast'), moved.recipes).map(i => i.n)).toEqual(['Egg and spinach scramble', 'Overnight oats']);
    for (const n of ['Chicken bowl', 'Post-workout', 'Quick dinner']) expect(made(n).ing.every(i => i.rid === undefined), n).toBe(true);
    expect(moveMeals(meals, moved.moved, moved.recipes).added).toBe(0);
  });
  it('gives each moved meal the calories and protein its saved foods had', () => {
    const { meals, recipes } = planner();
    const moved = moveMeals(meals, {}, recipes);
    for (const m of meals.filter(m => m.n !== 'Usual breakfast')) {
      const r = moved.recipes.find(x => x.n === m.n)!;
      expect(r.kcal).toBe(m.items.reduce((a, i) => a + i.kcal, 0));
      expect(r.p).toBe(m.items.reduce((a, i) => a + i.p, 0));
    }
  });
});
