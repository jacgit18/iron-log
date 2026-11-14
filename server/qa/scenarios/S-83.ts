import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-83', feature: 'Receipt merge', title: 'Two packs at different prices stay one item with both prices', persona: 'grocery-shopper', brief: 'receipt-merge-lines', device: true, edge: true,
  steps: [
    'As an admin, on your phone, photograph and scan a receipt that has the same meat (for example chuck roast) on two lines at different prices, such as $14.12 and $17.86, with no match on your list.',
    'Press Add to list once on the merged row and check the count and price in the form, then Add item and Apply.',
    'Look at Inventory and at the month on Shopping, then press Undo.',
  ],
  expected: [
    'One row with a note "2 packs, each at its own price: $14.12 + $17.86"; the form starts with Count 2 and the average price, both editable.',
    'Inventory gets ONE item (not two); the month shows both packs at their own prices and the bill matches the receipt; Undo removes the item and the month line.',
  ],
};

export default scenario;
