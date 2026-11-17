import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-325', feature: 'receipt-rewards-credit', title: 'Two stores in one month each keep their own rewards', persona: 'grocery-shopper', brief: 'receipt-rewards-credit', edge: true,
  steps: [
    'On Shopping scan a Costco receipt that prints a rewards line (Scan receipt, then Photos) and press Apply.',
    'Scan a second receipt from Trader Joe\'s, type 3.00 in its Rewards box, and press Apply. The sheet must be on the same month.',
    'Open Bought and look under the Costco heading, then the Trader Joe\'s heading, then the Spent figure.',
    'Change Costco\'s Rewards to 1.00 and press Enter.',
  ],
  expected: [
    'Each store has its own Rewards box with its own amount (Costco\'s from the first receipt, Trader Joe\'s at 3.00); the second Apply does not change Costco\'s.',
    'Spent is the sum of each store\'s items plus tax minus its own rewards.',
    'Changing Costco\'s Rewards changes Spent by that difference only; Trader Joe\'s stays 3.00.',
  ],
};

export default scenario;
