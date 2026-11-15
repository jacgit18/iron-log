import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-270', feature: 'Grocery list cap', title: 'The 501st item is refused', persona: 'grocery-at-cap', brief: 'feature-map',
  steps: [
    'Open Recipes, make a recipe with one ingredient no store has, and press "Add missing to Shopping" (Shopping and Inventory have no add box of their own).',
    'Open Groceries, Shopping, and read the count.',
  ],
  expected: [
    'The add is refused with "The list is full (500 items)." and Shopping still shows 500 to get; nothing is lost.',
  ],
};

export default scenario;
