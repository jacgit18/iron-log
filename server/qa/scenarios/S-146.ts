import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-146', feature: 'Groceries views', title: 'Search in Edit mode filters by name and opens folded stores', persona: 'grocery-shopper', brief: 'groceries-inventory-edit-list',
  steps: [
    'In Edit mode fold a store, then type part of one of its item names in the search box. Then type a name that matches nothing.',
  ],
  expected: [
    'The folded store opens and shows the matching row. The second search says "No items match" and the Add item, More and Done buttons stay at the bottom.',
  ],
};

export default scenario;
