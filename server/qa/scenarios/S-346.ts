import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-346', feature: 'Snap now, log later', title: 'A receipt saved on one browser shows under To log on a desktop', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later',
  steps: [
    'In a narrow browser window (phone width), signed in as this account, open Groceries, then Shopping, press Scan receipt, then Snap & save, and choose a receipt photo.',
    'In a second browser (or a private window) at desktop width, sign in as the same account and open Groceries, then Shopping.',
    'Look for the To log card.',
  ],
  expected: [
    'The desktop window shows a card headed "To log (1)" with the receipt you saved and its small photo, once Shopping has loaded (a reload at most).',
    'The row has Open and Delete.',
  ],
};

export default scenario;
