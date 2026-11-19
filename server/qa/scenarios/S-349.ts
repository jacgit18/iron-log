import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-349', feature: 'Snap now, log later', title: 'Delete removes a To log receipt and its photo', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Save a receipt with Snap & save so it shows under To log.',
    'Press Delete on its row and confirm if asked.',
    'Reload the page and open Groceries, then Shopping again.',
    'On a second browser signed in as the same account, open Shopping and look under To log.',
  ],
  expected: [
    'The row is gone from To log straight away, and the To log card is hidden if it was the only one.',
    'After the reload it has not come back.',
    'The second browser does not show it either.',
  ],
};

export default scenario;
