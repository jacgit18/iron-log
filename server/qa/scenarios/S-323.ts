import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-323', feature: 'receipt-rewards-credit', title: 'Rewards above the receipt total are refused', persona: 'grocery-shopper', brief: 'receipt-rewards-credit', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a Costco receipt. Wait for the sheet titled Receipt and note the Receipt total.',
    'Type an amount higher than the Receipt total in the Rewards box (for a total of $39.47, type 500.00).',
    'Type 0 in the Rewards box.',
    'Clear the box and press Apply.',
  ],
  expected: [
    'A red line reads "Rewards cannot be more than the receipt total ($39.47)." with your total, "You paid" is not shown, and Apply writes no credit.',
    'Zero is refused too, with "Rewards is dollars, like 17.27."',
    'After clearing, the error is gone and Apply works as an ordinary receipt: no rewards under the store\'s heading on Bought.',
  ],
};

export default scenario;
