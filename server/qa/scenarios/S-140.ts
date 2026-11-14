import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-140', feature: 'Groceries views', title: 'Quick add puts an item on Shopping with an honest notice, and Undo works', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add',
  steps: [
    'On Shopping press + Add one-time item to a store, type a name and press Enter.',
    'Add another item and press Undo in the notice.',
  ],
  expected: [
    'The item shows under that store and in Inventory. The notice says it is on this month\'s list and stays in Inventory, and has no Make it every month button.',
    'Undo takes the second item away.',
  ],
};

export default scenario;
