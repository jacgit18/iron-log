import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-179', feature: 'Goes with', title: 'Pair chili with rice; it shows from both and Remove clears both', persona: 'meal-planner', brief: 'recipes-goes-with',
  steps: [
    'In Recipes press + New, Recipe or meal: Chili, category Protein, 400 kcal and 30 g protein, one ingredient. Do the same for Rice, category Carbs, 200 kcal and 4 g protein.',
    'Open Chili. In Goes with press "Add a recipe it goes with…" and pick Rice.',
    'Open Rice and read its Goes with. Press Remove on Chili, then Tap again to remove, then open Chili again.',
  ],
  expected: [
    'Chili lists Rice with Make a meal (an underlined link) and Remove. Rice lists Chili without being set separately.',
    'The first Remove tap only changes the button to "Tap again to remove" and pairs stay; after the second, neither recipe lists the other.',
  ],
};

export default scenario;
