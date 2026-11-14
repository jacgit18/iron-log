import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-09', feature: 'Meal planner', title: 'A recipe\'s missing ingredients go to Shopping once; Nutrition has no button for it', persona: 'meal-planner', brief: 'diet-meal-planner',
  steps: [
    'Open Daily, Nutrition and look under the day for a button named Add missing ingredients to Shopping.',
    'Open Recipes, open a planned recipe and press Add missing to Shopping.',
    'Open Groceries and look at Shopping, then press the recipe\'s button again.',
  ],
  expected: [
    'Nutrition has no Add missing ingredients to Shopping button; the page ends with the day\'s Hydration.',
    'The recipe\'s button adds each ingredient it lacks once and reports how many were added and how many are on Shopping already.',
    'The second press adds nothing and says they are all on Shopping already.',
  ],
};

export default scenario;
