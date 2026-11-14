import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-172', feature: 'Receipt reconcile', title: 'A second receipt at the same store does not list what the first receipt bought', persona: 'grocery-shopper', brief: 'receipt-earlier-items', device: true,
  steps: [
    'On a phone, tick Milk 1 by hand on Shopping. Scan a receipt from a store, press Apply. Scan a second receipt from the same store with different items.',
    'Read the text under the lines and open "Review these" if it is there.',
  ],
  expected: [
    'The second sheet says how many items from an earlier receipt are not listed, and lists only Milk 1 (ticked by hand) under "Already bought, not on this receipt", folded until you press Review.',
    'It does not say "Is this the right one?" because some of this receipt\'s lines match your list.',
  ],
};

export default scenario;
