import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-308', feature: 'Receipt scan', title: 'Pick from photos is no longer in More, Saved receipts still is', persona: 'grocery-shopper', brief: 'receipt-pick-photo', edge: true,
  steps: [
    'On a phone open Groceries, then Shopping, and press More.',
    'On a computer look at the row beside Scan receipt.',
  ],
  expected: [
    'More on the phone holds Saved receipts and no Pick from photos.',
    'The computer row shows Scan receipt and Saved receipts and no Pick from photos; Photos is only inside the Scan receipt chooser.',
  ],
};

export default scenario;
