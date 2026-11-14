import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-253', feature: 'Receipts for everyone', title: 'An ordinary account sees saved receipts and Download all', persona: 'grocery-shopper', brief: 'receipts-everyone',
  steps: [
    'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
    'Open Groceries, then Receipts (if it is empty, keep a receipt photo first: S-59). Press Download all.',
  ],
  expected: [
    'Receipts opens for this non-admin account; Download all gives one zip with receipts.csv and each photo, naming any photo that could not load. Another account never sees these rows.',
  ],
};

export default scenario;
