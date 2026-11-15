import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-270', feature: 'Grocery list cap', title: 'The 501st item is refused', persona: 'grocery-at-cap', brief: 'feature-map',
  steps: [
    'Open Recipes, press New recipe, make a recipe with one ingredient no store has, and press "Add 1 missing to Shopping" (Shopping and Inventory have no add box of their own). Read the message under the button.',
    'Open Groceries, Shopping, and read the count.',
  ],
  expected: [
    'The message under the button reads "The list is full (500 items).", the add is refused and Shopping still shows 500 to get; nothing is lost.',
  ],
};

export default scenario;
