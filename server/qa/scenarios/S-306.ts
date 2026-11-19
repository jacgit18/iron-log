import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-306', feature: 'Receipt scan', title: 'Scan receipt opens a chooser with Camera and Photos', persona: 'grocery-shopper', brief: 'receipt-pick-photo', device: true,
  steps: [
    'On a phone open Groceries, then Shopping.',
    'Press Scan receipt.',
    'Press Camera. Then press Scan receipt again and press Photos.',
  ],
  expected: [
    'Two buttons, Camera and Photos, show under Scan receipt, each easy to tap (48 px tall).',
    'Camera opens the phone camera and the chooser closes.',
    'Photos opens the phone photo picker (your gallery, not the camera) and the chooser closes. A computer shows the same chooser and opens its file dialog.',
  ],
};

export default scenario;
