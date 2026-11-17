import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-320', feature: 'receipt-rewards-credit', title: 'Undo after Apply puts the rewards back as they were', persona: 'grocery-shopper', brief: 'receipt-rewards-credit',
  steps: [
    'Open Bought, find Costco\'s heading and note whether it has a Rewards amount (it should not for this account).',
    'On Shopping press Scan receipt, then Photos, pick a photo of a Costco receipt that prints a rewards line, and press Apply.',
    'Press Undo on the notice before it goes away.',
    'Open Bought and look at Costco\'s heading and the Spent figure.',
  ],
  expected: [
    'After Apply, Costco has a Rewards box with the receipt\'s amount.',
    'After Undo, the Rewards checkbox under Costco is unticked with no amount, Spent is back to what it was before Apply, and the items Apply bought are unticked again.',
  ],
};

export default scenario;
