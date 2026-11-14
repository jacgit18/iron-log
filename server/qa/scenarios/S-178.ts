import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-178', feature: 'Library rows', title: 'Library tabs and how much of a recipe is at home', persona: 'grocery-shopper', brief: 'recipes-used-as-ingredients-tab',
  steps: [
    'Open Groceries and make sure a few items are in At home. Open Recipes, press Library.',
    'Press Meals, Ingredients and Drinks in turn. Read the "n of m at home" on rows.',
    'Press Ingredients, open the filters above the list and set Category to Dessert (no loaded ingredient is a dessert).',
  ],
  expected: [
    'Library has All, Meals, Ingredients and Drinks (no Foods) and no counts. A row says how many of its ingredients are at home, for example "2 of 5 at home".',
    'An empty tab says "No ingredients among these. Show more to load others." and offers Show more.',
  ],
};

export default scenario;
