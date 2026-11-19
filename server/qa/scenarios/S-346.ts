import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-346', feature: 'Snap now, log later', title: 'A receipt saved on one browser shows under To log on a desktop', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later',
  steps: [
    'In a narrow browser window (phone width), signed in as this account, open Groceries, then Shopping, press Snap & save and choose a receipt photo.',
    'In a second browser (or a private window) at desktop width, sign in as the same account and open Groceries, then Shopping.',
    'Look for the To log card.',
  ],
  expected: [
    'The desktop window shows the To log card with the receipt you saved, with its small photo, within one refresh.',
    'The row has Open and Delete.',
  ],
};

export default scenario;
