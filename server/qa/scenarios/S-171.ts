import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-171', feature: 'Groceries views', title: 'The same name can be quick-added again after the first one is bought', persona: 'grocery-shopper', brief: 'quickadd-one-time-items', edge: true,
  steps: [
    'Quick add Milk, tick it, then quick add Milk in the same store again.',
  ],
  expected: [
    'The second Milk is added with no "already in this store\'s list" message and shows on Shopping.',
  ],
};

export default scenario;
