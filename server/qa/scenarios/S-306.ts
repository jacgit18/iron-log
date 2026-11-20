import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-306', feature: 'Receipt scan', title: 'Scan receipt opens a chooser with Camera, Photos and Snap & save', persona: 'grocery-shopper', brief: 'receipt-pick-photo', device: true,
  steps: [
    'On a phone open Groceries, then Shopping.',
    'Press Scan receipt.',
    'Press Camera. Then press Scan receipt again and press Photos. Then press Scan receipt again and press Snap & save.',
  ],
  expected: [
    'Three buttons, Camera, Photos and Snap & save, show under Scan receipt with a line saying Snap & save keeps the photo to read later, each easy to tap (48 px tall).',
    'Camera opens the phone camera and the chooser closes.',
    'Photos opens the phone photo picker (your gallery, not the camera) and the chooser closes. A computer shows the same chooser and opens its file dialog.',
    'Snap & save opens the phone camera and the chooser closes; the photo is saved under To log without being read.',
  ],
};

export default scenario;
