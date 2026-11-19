import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-351', feature: 'Snap now, log later', title: 'Two devices open the same To log receipt: the first Apply wins', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Save a receipt with Snap & save. On two browsers signed in as the same account, open Shopping so both show the row under To log.',
    'On browser one, press Open, Read this receipt, then Apply.',
    'On browser two (not reloaded), press Open on the same row.',
    'On browser two, if the sheet opens, press Read this receipt and Apply.',
    'Open the Bought view and check the prices the receipt set.',
  ],
  expected: [
    'Browser one applies the receipt and it moves to Receipts.',
    'Browser two says the receipt was already logged (it does not apply it a second time).',
    'Prices and the receipt count show the receipt once, not twice.',
  ],
};

export default scenario;
