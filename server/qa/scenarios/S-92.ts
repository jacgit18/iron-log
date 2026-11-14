import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-92', feature: 'Receipt reconcile', title: 'The receipt has a different count than you ticked', persona: 'grocery-shopper', brief: 'receipt-reconcile-ticked', edge: true, device: true,
  steps: [
    'On a phone, tick one item with a count of 1 and a price. Scan a receipt where that item is bought twice (a count of 2 at the same unit price).',
    'Read the note under its row, then press Apply and open the item.',
  ],
  expected: [
    'The note says "Count changed" with "Was 1 × $4.49, now 2 × $4.49".',
    'After Apply the item shows a count of 2 at $4.49; the receipt\'s count wins over the one you ticked with.',
  ],
};

export default scenario;
