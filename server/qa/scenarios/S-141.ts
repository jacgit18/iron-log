import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-141', feature: 'Groceries views', title: 'Quick add refuses a name already in that store and an empty name', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add', edge: true,
  steps: [
    'On Shopping press + Add one-time item to a store and press Enter with nothing typed.',
    'Type the name of an item already in that store and press Enter.',
  ],
  expected: [
    'A message says to give the item a name, and the field stays open.',
    'A message says the item is already in this store\'s list, and nothing is added.',
  ],
};

export default scenario;
