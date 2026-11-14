import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-165', feature: 'Grocery budget', title: 'An invalid amount is refused', persona: 'grocery-shopper', brief: 'grocery-budget', edge: true,
  steps: [
    'Press Set a budget (or Edit), type "abc", and press Save.',
    'Clear the box, press Save, then type 0 and press Save.',
    'Type 425.50 and press Save.',
  ],
  expected: [
    'Each bad try keeps the box open and says "Enter an amount in dollars, like 400 or 425.50."; nothing is saved.',
    '425.50 saves and the card reads "of $425.50".',
  ],
};

export default scenario;
