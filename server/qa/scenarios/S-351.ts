import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-351', feature: 'Snap now, log later', title: 'Two devices open the same To log receipt: the first Apply wins', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Save a receipt with Scan receipt, then Snap & save. On two browsers signed in as the same account, open Shopping so both show the row under To log.',
    'On browser one, press Open, Read this receipt, then Apply.',
    'On browser two (not reloaded), press Open on the same row.',
    'On browser one, delete a second receipt (Delete, then Delete for good). On browser two (not reloaded), press Open on that row.',
    'Open Saved receipts and the Bought view and check the receipt shows once.',
  ],
  expected: [
    'Browser one applies the receipt and it is on the Saved receipts page.',
    'Browser two shows "That receipt was already logged on another device. It is under Saved receipts." and opens no sheet; the row leaves To log.',
    'For the deleted one, browser two shows "That receipt is gone. It was deleted on another device." and opens no sheet.',
    'Prices and Saved receipts show the receipt once, not twice.',
  ],
};

export default scenario;
