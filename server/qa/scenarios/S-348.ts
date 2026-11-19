import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-348', feature: 'Snap now, log later', title: 'Undo after applying a To log receipt puts it back under To log', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Note a price in the Bought view for an item the receipt will match.',
    'Open a To log receipt, press Read this receipt, then Apply.',
    'Within 10 seconds, press Undo on the notice.',
    'Check the Bought view price again, then look at the To log card and the Receipts list.',
  ],
  expected: [
    'The Bought view price is back to the value you noted.',
    'The receipt row is back under To log.',
    'It is not in Receipts.',
  ],
};

export default scenario;
