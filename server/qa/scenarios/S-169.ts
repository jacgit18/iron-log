import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-169', feature: 'Groceries views', title: 'The One-time item box in Edit makes any item leave after it is bought', persona: 'grocery-shopper', brief: 'quickadd-one-time-items',
  steps: [
    'Open Inventory, press Edit, open an item and tick One-time item.',
    'Press Done, tick that item on Shopping, then open Inventory.',
  ],
  expected: [
    'The box stays ticked after you reopen the row.',
    'The item is gone from Inventory and shows on Bought.',
  ],
};

export default scenario;
