import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-178', feature: 'Library rows', title: 'Library tabs and how much of a recipe is at home', persona: 'grocery-shopper', brief: 'recipes-used-as-ingredients-tab',
  steps: [
    'Open Groceries and make sure a few items are in At home. Open Recipes, press the Library pill.',
    'Press Meals, Ingredients and Drinks in turn (the pills under the search box). Read the "n of m at home" on Library rows.',
    'Press Ingredients, open the filters above the list and set Category to Dessert (no loaded ingredient is a dessert).',
  ],
  expected: [
    'With the Library pill on, the type pills are All, Foods, Meals, Ingredients and Drinks (no Recent) and show no counts; Foods lists no Library rows. A row says how many of its ingredients are at home, for example "2 of 5 at home".',
    'An empty tab says "No ingredients among these. Show more to load others." and offers Show more.',
  ],
};

export default scenario;
