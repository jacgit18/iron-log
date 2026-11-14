import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-170', feature: 'Groceries views', title: 'Unticking a bought one-time item brings it back', persona: 'grocery-shopper', brief: 'quickadd-one-time-items', edge: true,
  steps: [
    'Quick add Milk and tick it on Shopping.',
    'Open Bought and untick Milk, then open Inventory.',
  ],
  expected: [
    'Milk goes back to Shopping.',
    'Milk is in Inventory again, with its one-time box still ticked.',
  ],
};

export default scenario;
