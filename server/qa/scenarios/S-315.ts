import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-315', feature: 'Receipt back guard', title: 'Discard on the Resume row erases the draft', persona: 'grocery-shopper', brief: 'receipt-back-guard', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt. Wait for the sheet titled Receipt.',
    'Press Close.',
    'On the "Resume your receipt" row press Discard.',
    'Reload the page and open Shopping again.',
  ],
  expected: [
    'Discard removes the row at once.',
    'After the reload there is still no "Resume your receipt" row.',
  ],
};

export default scenario;
