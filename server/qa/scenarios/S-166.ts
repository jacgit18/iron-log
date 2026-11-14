import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-166', feature: 'Grocery budget', title: 'A list that costs more than the budget says what is left to spend', persona: 'grocery-shopper', brief: 'grocery-budget', edge: true,
  steps: [
    'Set the budget to a small amount, such as 10, so this month\'s priced to-get items add up to more than it.',
    'Look at the card on Shopping.',
  ],
  expected: [
    'A note under the bar, in amber, reads "You still have <amount> left in your budget to spend." and the "<amount> left" on the line above is hidden, so the figure shows once.',
    'Raising the budget above the plan removes the note.',
  ],
};

export default scenario;
