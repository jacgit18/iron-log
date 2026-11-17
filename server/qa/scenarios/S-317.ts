import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-317', feature: 'receipt-rewards-credit', title: 'A receipt with a rewards line shows Rewards and You paid on the sheet', persona: 'grocery-shopper', brief: 'receipt-rewards-credit',
  steps: [
    'Open Groceries, then Shopping, press Scan receipt, then Photos, and pick a photo of a Costco receipt that prints a rewards or points credit line (the brief\'s example is BJ\'s: total 572.94, rewards 17.27, card charged 555.67). Wait for the sheet titled Receipt.',
    'Read the numbers line under the store and date.',
  ],
  expected: [
    'The numbers line reads Lines, Tax and "Receipt total" with the printed total (before rewards), then a Rewards box with the printed credit already filled in, then "You paid" followed by the total minus the rewards (on the BJ\'s example: Receipt total $572.94, Rewards 17.27, You paid $555.67).',
    'The Rewards box has the label "Rewards $", and the sheet shows no error under the numbers line.',
  ],
};

export default scenario;
