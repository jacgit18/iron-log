import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-345', feature: 'Snap now, log later', title: 'Snap & save keeps a receipt photo under To log without reading it', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later',
  steps: [
    'Open Groceries, then Shopping. Under the buttons, find Camera, Library and Snap & save in one row.',
    'Press Snap & save, choose a photo of a receipt, and type a store name if asked.',
    'Wait for the upload to finish, then reload the page and open Groceries, then Shopping again.',
    'Open the Bought view and check the prices of the items.',
  ],
  expected: [
    'Snap & save sits in the same row as Camera and Library.',
    'A To log card appears with a row that has a small photo of the receipt (and the store name if you typed one).',
    'The row is still there after the reload.',
    'No receipt sheet opened, and no price or list changed: nothing was read yet.',
  ],
};

export default scenario;
