import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-352', feature: 'Snap now, log later', title: 'Snap & save with the phone camera, then finish it on another device', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', device: true,
  steps: [
    'On a phone, open Groceries, then Shopping, press Scan receipt, then Snap & save.',
    'Photograph a real receipt with the camera and confirm.',
    'Wait for the notice, then open the app on a computer signed in as the same account and open Shopping.',
    'On the computer press Open on the new row under To log, then Read this receipt.',
  ],
  expected: [
    'The phone opens its camera, and after the photo the notice says "Photo saved under To log. Open it later, on any device." with a row under To log.',
    'The computer shows the same row under "To log (1)".',
    'Read this receipt on the computer shows the lines of the receipt you photographed, and Show the receipt photo opens a readable photo.',
  ],
};

export default scenario;
