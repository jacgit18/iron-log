import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-251', feature: 'Grocery purchase log', title: 'Ran out keeps the purchase in Spending', persona: 'grocery-shopper', brief: 'grocery-purchase-log',
  steps: [
    'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
    'On Shopping tick a priced item (bought). Open Inventory, note this month\'s Spending, then untick that item (there is no Ran out button).',
    'Open Bought and its Spending history switch, then, if a sharing group exists, the Who owes who button under This month. Then open Shopping.',
  ],
  expected: [
    'The item\'s cost stays in the month\'s Spending and in who owes who, and the item is back on Shopping, unticked.',
  ],
};

export default scenario;
