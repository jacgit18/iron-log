import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-328', feature: 'Receipt drafts list', title: 'A draft survives closing the installed app on a phone', persona: 'grocery-shopper', brief: 'receipt-drafts-list', device: true,
  steps: [
    'On a phone, with the app installed to the home screen, open Groceries, then Shopping, press Scan receipt, then Camera, and photograph a receipt.',
    'Untick one line with its "Include" box, then press Save for later.',
    'Swipe the app away from the phone\'s recent apps so it is fully closed, wait a minute, then open it again from the home screen.',
    'Open Groceries, then Shopping, and press Resume on the row under Scan receipt.',
  ],
  expected: [
    'After reopening, the "Draft receipt" row is still under Scan receipt, with its age counting from when you saved it.',
    'Resume reopens the Receipt sheet with the line still unticked.',
  ],
};

export default scenario;
