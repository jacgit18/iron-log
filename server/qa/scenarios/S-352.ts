import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-352', feature: 'Snap now, log later', title: 'Snap & save with the phone camera, then finish it on another device', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', device: true,
  steps: [
    'On a phone, open Groceries, then Shopping and press Snap & save.',
    'Choose the camera, photograph a real receipt, and confirm.',
    'Wait for the upload, then open the app on a computer signed in as the same account and open Shopping.',
    'On the computer press Open on the new row under To log, then Read this receipt.',
  ],
  expected: [
    'The phone opens its camera, and the photo shows under To log with a small photo.',
    'The computer shows the same row under To log.',
    'Read this receipt on the computer shows the lines of the receipt you photographed, with the photo readable beside them.',
  ],
};

export default scenario;
