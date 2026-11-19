import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-347', feature: 'Snap now, log later', title: 'Open a To log receipt, read it, and apply it', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later',
  steps: [
    'With a receipt under To log (save one with Scan receipt, then Snap & save, if none), press Open on its row.',
    'Look at the sheet before pressing anything else. Check the Bought count on Shopping behind it is unchanged.',
    'Press Read this receipt and wait for the lines to appear.',
    'Open Show the receipt photo, review the lines, then press the Apply button (it reads like "Apply 1 item, $26.98").',
    'Look at the To log card and open Saved receipts.',
  ],
  expected: [
    'The sheet is titled "Receipt to log", shows the photo and the line "Nothing on your list changes until you read this receipt and press Apply.", with Read this receipt, Delete this receipt and Close.',
    'After Read this receipt the sheet is titled "Receipt" and shows the lines. It has a "Show the receipt photo" disclosure and no "Keep a copy" box. Nothing in the list or prices changed before Apply.',
    'After Apply the Bought count goes up, the row is gone from To log (the card disappears if it was the last one) and the receipt is on the Saved receipts page.',
    'Apply does not upload a second copy of the photo: Saved receipts lists the receipt once.',
  ],
};

export default scenario;
