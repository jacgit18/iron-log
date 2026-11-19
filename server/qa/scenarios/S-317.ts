import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-317', feature: 'Nutrition meal labels and repeat', title: 'A recipe saves a usual meal and shows it on its card', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat',
  steps: [
    'Open Recipes and start a new recipe. Type the Name "Oatmeal" and an ingredient in Ingredient 1.',
    'Find the Usual meal row. It offers Breakfast, Lunch, Dinner, Snack and None. Press Breakfast.',
    'Press Save recipe, then open the Oatmeal card.',
  ],
  expected: [
    'On the form the Usual meal row has exactly Breakfast, Lunch, Dinner, Snack and None, and Breakfast shows as pressed.',
    'The card shows "Usual meal: Breakfast".',
  ],
};

export default scenario;
