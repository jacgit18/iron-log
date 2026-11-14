import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-137', feature: 'Receipt scan', title: 'Forget a receipt name from an item and Undo', persona: 'grocery-shopper', brief: 'receipt-rename-memory', edge: true, device: true,
  steps: [
    'On a phone, in Inventory press Edit and open an item that has receipt names (rename a receipt line to it and Apply first; the seed has none). Press Forget beside one.',
    'Press Undo in the Removed notice, then scan a receipt with that text.',
  ],
  expected: [
    'The name is gone from the list and a Removed notice with Undo appears; the Forget buttons are easy to hit.',
    'The name is back after Undo. After Forget (without Undo) a scan with that text no longer matches.',
  ],
};

export default scenario;
