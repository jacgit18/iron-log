import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-322', feature: 'receipt-rewards-credit', title: 'A receipt with no rewards line shows an empty Rewards box and no You paid', persona: 'grocery-shopper', brief: 'receipt-rewards-credit', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt with no rewards or points line. Wait for the sheet titled Receipt.',
    'Read the numbers line, then type 2.50 in the empty Rewards box.',
    'Clear the box again and press Apply, then open Bought and look under the store\'s heading.',
  ],
  expected: [
    'The Rewards box is empty (it shows 0.00 faintly) and "You paid" is not shown.',
    'After typing 2.50, "You paid" appears as the Receipt total minus 2.50 (a rewards line the scan missed is covered by typing it).',
    'With the box cleared nothing is written: the notice has no rewards in it, and the Rewards checkbox under the store is unticked.',
  ],
};

export default scenario;
