import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-314', feature: 'Receipt back guard', title: 'Back on an untouched receipt closes it as before and still keeps a draft', persona: 'grocery-shopper', brief: 'receipt-back-guard', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt. Wait for the sheet titled Receipt.',
    'Change nothing and press Back.',
    'Press Resume on the row under Scan receipt.',
    'Click the dimmed area outside the sheet.',
  ],
  expected: [
    'Back closes the sheet at once with no "Leave this receipt?" bar.',
    'The "Resume your receipt" row shows with "closed just now" and Resume reopens the receipt as scanned.',
    'The click outside an untouched sheet closes it without asking.',
  ],
};

export default scenario;
