import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-311', feature: 'Receipt back guard', title: 'A tap outside the sheet and Escape ask first on a changed receipt', persona: 'grocery-shopper', brief: 'receipt-back-guard',
  steps: [
    'On a computer, on Shopping press Scan receipt, then Photos, and pick a photo of a receipt. Wait for the sheet titled Receipt.',
    'Untick one line with its "Include" box, then click the dimmed area outside the sheet.',
    'Press Keep editing, then press Escape.',
    'Press Discard.',
  ],
  expected: [
    'The click outside does not close the sheet: "Leave this receipt?" shows with Keep editing and Discard.',
    'Keep editing returns to the receipt; Escape then shows "Leave this receipt?" again.',
    'Discard closes the sheet.',
  ],
};

export default scenario;
