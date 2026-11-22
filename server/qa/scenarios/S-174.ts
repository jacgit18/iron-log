import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-174', feature: 'Used as', title: 'Sauces and seasonings are Ingredients, not Meals', persona: 'recipe-collector', brief: 'recipes-used-as-ingredients-tab',
  steps: [
    'Open Recipes, press + New, Recipe or meal. Name it Garlic aioli, set the category to Sauces and add one ingredient. Read the Used as chips, then Save.',
    'Go Back and press the Meals tab, then the Ingredients tab.',
  ],
  expected: [
    'Used as starts on Ingredient only. The recipe is not in Meals and is in Ingredients, and its row has no Log button.',
    'The tabs read All, Foods, Meals, Ingredients, Drinks, each with a count.',
  ],
};

export default scenario;
