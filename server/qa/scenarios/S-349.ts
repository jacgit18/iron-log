import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-349', feature: 'Snap now, log later', title: 'Delete removes a To log receipt and its photo', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Save a receipt with Scan receipt, then Snap & save, so it shows under To log.',
    'Press Delete on its row. It asks first: press Keep it, then Delete again.',
    'Press Delete for good.',
    'Reload the page and open Groceries, then Shopping again. On a second browser signed in as the same account, open Shopping and look for To log.',
    'Save another receipt, press Open on it, then Delete this receipt, and press Delete in the question that follows.',
  ],
  expected: [
    'Keep it closes the question and the row stays.',
    'After Delete for good the row is gone straight away, and the To log card is hidden if it was the only one.',
    'After the reload it has not come back, and the second browser does not show it either.',
    'Delete this receipt asks "Delete this receipt and its photo? This cannot be undone." and, after Delete, the sheet closes and the row is gone.',
  ],
};

export default scenario;
