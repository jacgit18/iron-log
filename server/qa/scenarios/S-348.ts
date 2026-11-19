import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-348', feature: 'Snap now, log later', title: 'Undo after applying a To log receipt puts it back under To log', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Note the Bought count on Shopping and a price in the Bought view for an item the receipt will match.',
    'Open a To log receipt, press Read this receipt, then Apply.',
    'Within 10 seconds, press Undo on the notice.',
    'Check the Bought count and price again, then look at the To log card and open Saved receipts.',
  ],
  expected: [
    'The Bought count and the price are back to the values you noted.',
    'The receipt row is back under To log.',
    'It is not on the Saved receipts page.',
  ],
};

export default scenario;
