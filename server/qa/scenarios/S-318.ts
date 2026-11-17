import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-318', feature: 'receipt-rewards-credit', title: 'Typing a new Rewards amount changes You paid, clearing it removes the credit, a bad amount is refused', persona: 'grocery-shopper', brief: 'receipt-rewards-credit',
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a Costco receipt that prints a rewards line. Wait for the sheet titled Receipt.',
    'Click the Rewards box and type 20.00. Look at "You paid" and at the Apply button at the bottom.',
    'Type abc in the Rewards box.',
    'Clear the Rewards box.',
  ],
  expected: [
    '"You paid" becomes the Receipt total minus 20.00, and the Apply button text drops by the same change in rewards (Apply N items, then the items plus tax minus 20.00).',
    'A red line under the numbers says "Rewards is dollars, like 17.27.", the box is marked invalid, and "You paid" is gone (a bad amount counts as none).',
    'The error goes away, "You paid" is not shown, and Apply is back to items plus tax only.',
  ],
};

export default scenario;
