import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-345', feature: 'Snap now, log later', title: 'Snap & save keeps a receipt photo under To log without reading it', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later',
  steps: [
    'Open Groceries, then Shopping. Press Scan receipt and read the choices that open under it.',
    'Press Snap & save and choose a photo of a receipt.',
    'Read the line under the buttons, then reload the page and open Groceries, then Shopping again.',
    'Open the Bought view and check the prices of the items.',
  ],
  expected: [
    'Scan receipt opens three buttons, Camera, Photos and Snap & save, with the hint "Snap & save keeps the photo to read later, on any device."',
    'The notice says "Photo saved under To log. Open it later, on any device." and a card headed "To log (1)" with a New pill appears, with a row (a small photo and a title like "snapped Nov 18") that has Open and Delete.',
    'The To log (1) row is still there after the reload.',
    'No receipt sheet opened, and no price or tick changed: nothing was read yet.',
  ],
};

export default scenario;
