import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-168', feature: 'Groceries views', title: 'A quick-added item leaves Inventory after it is bought', persona: 'grocery-shopper', brief: 'quickadd-one-time-items',
  steps: [
    'On Shopping press + Add one-time item to a store, type Milk and press Enter. The notice says it is a one-time item.',
    'Tick Milk on Shopping. Open Inventory, then Bought.',
  ],
  expected: [
    'The notice says Milk leaves Inventory and next month\'s list after you buy it.',
    'Milk is not in Inventory any more, and it shows on Bought for this month.',
  ],
};

export default scenario;
