import type { Scenario } from '../scenarios.ts';

// ---- Ingredient macros ----
const scenario: Scenario = {
  id: 'S-15', feature: 'Ingredient macros', title: 'Totals from looked-up ingredients', persona: 'meal-planner', brief: 'recipe-ingredient-macros',
  steps: [
    'Edit the recipe "Chicken and rice bowl". Change its first two ingredient amounts to "200 g" and "150 g".',
    'Open the ingredient nutrition helper, look each of the two up and pick a food. (This needs QA\'s food lookup key; see S-17.)',
    'Press Use these numbers, then Cancel the form without saving.',
  ],
  expected: [
    'The panel counts the two gram-readable ingredients, sums them, divides by the servings, and fills Calories, Protein, Carbs and Fat per serving.',
    'The numbers stay editable; Cancel leaves the recipe as it was.',
  ],
};

export default scenario;
