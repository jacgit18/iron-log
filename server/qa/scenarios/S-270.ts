import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-270', feature: 'Grocery list cap', title: 'The 501st item is refused', persona: 'grocery-at-cap', brief: 'feature-map',
  steps: [
    'Open Groceries, Shopping, and try to add one more item with Quick add (an item name no store has).',
    'Repeat from Inventory, Edit, if it has its own add box.',
  ],
  expected: [
    'The add is refused with "The list is full (500 items)." and the list stays at 500; Quick add and Inventory both say so; nothing is lost.',
  ],
};

export default scenario;
