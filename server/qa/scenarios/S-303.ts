import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-303', feature: 'Receipt share', title: 'A line chip beats the whole-receipt split, Apply saves it, Undo takes it back', persona: 'grocery-shopper', brief: 'receipt-share', device: true,
  steps: [
    'On a phone, scan a receipt with at least two items from your list. In "Split this receipt" tick Sam.',
    'Under one ticked line press its chip, untick Sam so it reads Just me, and note the owed line above.',
    'Press the chip again and press "Same as the whole receipt".',
    'Untick Sam on that line again, press Apply, then open Bought and the Who owes who card, then press Undo on the notice.',
  ],
  expected: [
    'Each ticked line has a chip under its Name box; a line you changed reads Just me and its chip has the accent outline; the owed line drops that line\'s half.',
    '"Same as the whole receipt" puts that line back on the receipt split (Me +1).',
    'After Apply the lines you split carry that split in Who owes who (Sam owes you his half of the split lines); the items\' usual split on Inventory did not change.',
    'Undo puts the lines back as they were, with no split.',
  ],
};

export default scenario;
