import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-22', feature: 'Recipe nutrition', title: 'Meal tags from the recipe form', persona: 'recipe-collector', brief: 'recipe-nutrition-badges',
  steps: [
    'Edit a recipe and look at the tag suggestions.',
    'Tap Dinner and save.',
    'Return to the list.',
  ],
  expected: [
    'Breakfast, Lunch, Dinner and Snack are suggested (those not already used); Dinner becomes an ordinary tag and shows as a tag chip on the list.',
  ],
};

export default scenario;
