import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-91', feature: 'Receipt reconcile', title: 'An item marked bought that is not on the receipt is listed, stays bought, or moves back to to-get', persona: 'grocery-shopper', brief: 'receipt-reconcile-ticked', edge: true, device: true,
  steps: [
    'On a phone, on Shopping, tick an item you will not put on the receipt (say Milk, with a price) and two that are on it. Scan the receipt.',
    'Find "Already bought, not on this receipt" under the lines, press "Review these" and read the row for Milk. Press Apply without touching it and look at Milk.',
    'Scan again, open the list, tick "Move back" on Milk, and read the footer; press Apply, look at Milk, then press Undo.',
    'Scan a receipt that has none of your ticked items.',
  ],
  expected: [
    'Milk is listed with what it holds now ("Bought: 1 × $3.79"); applying leaves Milk ticked with its price.',
    'With the box ticked, the row says "Will move back to Shopping", the footer says "1 will move back to Shopping.", Apply puts Milk back on Shopping with the notice "1 item moved back to Shopping.", and Undo ticks it again with its price.',
    'When nothing on the receipt matches your list, the text above the list starts with "None of the items on your list match this receipt. Is this the right one?"',
  ],
};

export default scenario;
