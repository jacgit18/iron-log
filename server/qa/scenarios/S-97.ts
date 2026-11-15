import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-97', feature: 'Security headers', title: 'The barcode scanner\'s live camera opens on a phone', persona: 'diet-fresh', brief: 'camera-and-headers', device: true,
  steps: [
    'On a phone, open Daily, Nutrition and press Scan and log in the toolbar.',
    'When the browser asks to use the camera, allow it. Read the line under the camera view.',
    'Scan any product barcode, then close the sheet and reopen it.',
  ],
  expected: [
    'The sheet says "Starting the camera..." and then shows the live camera view with "Point the camera at the barcode."; it does not drop to the photo-of-the-barcode choice because the site blocked the camera.',
    'A scanned code is looked up; closing the sheet switches the camera off (the browser\'s camera light goes out), and reopening starts it again.',
  ],
};

export default scenario;
