import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-163', feature: 'Grocery budget', title: 'The bar turns amber near the budget and red when over', persona: 'grocery-shopper', brief: 'grocery-budget',
  steps: [
    'Press Edit and set the budget to about 1.1 times what this month has spent, so spent is over 80% of it. Save.',
    'Press Edit again and set a budget a little below what has been spent. Save.',
  ],
  expected: [
    'From 80% of the budget the bar and card turn amber and the text still says how much is left.',
    'When spent is above the budget the bar is full and red and the text reads "<amount> over budget".',
  ],
};

export default scenario;
