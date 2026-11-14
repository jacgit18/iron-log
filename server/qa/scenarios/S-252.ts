import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-252', feature: 'Grocery purchase log', title: 'Buy it again: a second purchase is its own line', persona: 'grocery-shopper', brief: 'grocery-purchase-log', edge: true,
  steps: [
    'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
    'Tick the same item as bought again on Shopping after you unticked it. Open Bought.',
  ],
  expected: [
    'Bought lists both purchases, newest first, each with date and time; the month total counts both. Unticking on Shopping or Bought removes only the open purchase, never a closed one.',
  ],
};

export default scenario;
