import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-167', feature: 'Grocery budget', title: 'The Shopping and Bought switch is centered with no counts (retired 2026-11-13: the Groceries switch is now Shopping, Bought and Inventory, covered by S-122 and S-138)', persona: 'grocery-shopper', brief: 'grocery-budget', retired: true,
  steps: [
    'Open Groceries on a computer and look at the Shopping and Bought buttons.',
  ],
  expected: [
    'The two buttons show only their names, with no numbers, and sit centered on a row of their own.',
  ],
};

export default scenario;
