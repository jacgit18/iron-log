import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-90', feature: 'Receipt reconcile', title: 'Tick items in the store, scan the receipt at home, and see Was and Now', persona: 'grocery-shopper', brief: 'receipt-reconcile-ticked', device: true,
  steps: [
    'On a phone. On Groceries, Shopping, tick three items as if you were in the store without typing a price (or with an old one).',
    'Later, press Scan receipt, then Camera, and photograph a receipt that has those three items, and read the note under each of their rows.',
    'Press Apply and look at the three items; then press Undo.',
  ],
  expected: [
    'Each ticked item\'s row says what the list had and what the receipt says ("Was no price, now 1 × $8.99"), with a label: Price added, Price changed, Count changed or Matches the list; an item you did not tick has no note.',
    'Apply gives the three items the receipt\'s price and count, and the item that had no price now has one; Undo puts the old price, count and "no price" back.',
  ],
};

export default scenario;
