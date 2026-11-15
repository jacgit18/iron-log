import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-82', feature: 'Receipt merge', title: 'The same item twice on a receipt is one row', persona: 'grocery-shopper', brief: 'receipt-merge-lines', device: true,
  steps: [
    'As an admin, on your phone, photograph and scan a Costco receipt where the same item (for example eggs) is printed on two lines with the same price.',
    'In the sheet find that item. Tick it, pick the matching item from the list, and press Apply.',
    'On Shopping look at the item, then press Undo.',
  ],
  expected: [
    'The sheet shows ONE row for the two lines, with one checkbox, one item picker, a count of 2 and "$X each" under the price; the total check and the Apply count are unchanged by the merge.',
    'After Apply the item is ticked bought with a count of 2 at that price; Undo puts it back.',
  ],
};

export default scenario;
