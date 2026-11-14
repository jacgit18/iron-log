import type { Scenario } from '../scenarios.ts';

// ---- Grocery budget ----
const scenario: Scenario = {
  id: 'S-162', feature: 'Grocery budget', title: 'Set a monthly budget and read spent of budget', persona: 'grocery-shopper', brief: 'grocery-budget',
  steps: [
    'Open Groceries, Shopping. Under the summary press Set a budget.',
    'Type 400 and press Save. Then open Bought.',
  ],
  expected: [
    'The card reads "Budget", then "<this month\'s spent> of $400.00", with a bar filled to the share spent and an Edit button. "<amount> left" sits beside the spent figure (S-166 covers a list that costs more than the budget).',
    'Bought shows the same card with the same figures (spent includes tax, as the summary does).',
  ],
};

export default scenario;
