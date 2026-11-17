import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-302', feature: 'Receipt share', title: 'The receipt sheet splits the whole receipt and says who owes what', persona: 'grocery-shopper', brief: 'receipt-share', device: true,
  steps: [
    'On your own account on a phone, open Groceries, Shopping and press Scan receipt, then Camera, and photograph a receipt with a few items from your list (Grocery shopper has the sharing group Home with Sam and Alex).',
    'In the sheet find the box "Split this receipt" under the line that checks the total; do not press Apply yet.',
    'Press the chip in that box (it reads Just me, or the usual split), tick Sam, and read the line under the chip.',
  ],
  expected: [
    'The box shows once a sharing group exists, with the chip, a line of what each person owes you, and the note "Applies to every ticked line."',
    'After ticking Sam the chip reads Me +1 and the line reads like "Sam owes you $9.25 · your share $9.24" for the ticked lines; unticking a line changes the amounts.',
    'Nothing else on the sheet moved: the Name boxes, Add to list and the Apply bar are where they were.',
  ],
};

export default scenario;
