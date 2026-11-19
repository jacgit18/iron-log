import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-347', feature: 'Snap now, log later', title: 'Open a To log receipt, read it, and apply it', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later',
  steps: [
    'With a receipt under To log (save one with Snap & save if none), press Open on its row.',
    'Look at the Receipt sheet before pressing anything else. Check the Bought view prices behind it are unchanged.',
    'Press Read this receipt and wait for the lines to appear.',
    'Review the lines, then press Apply.',
    'Look at the To log card and the Receipts list.',
  ],
  expected: [
    'The Receipt sheet opens with the saved photo and a Read this receipt button; no lines are read yet.',
    'After Read this receipt the review sheet shows the lines; nothing in the lists or prices changed before Apply.',
    'After Apply the receipt is in Receipts and its row is gone from To log (the To log card disappears if it was the last one).',
    'The sheet does not upload a second copy of the photo.',
  ],
};

export default scenario;
