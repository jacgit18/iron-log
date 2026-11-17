import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-313', feature: 'Receipt back guard', title: 'Applying a resumed receipt erases the draft', persona: 'grocery-shopper', brief: 'receipt-back-guard',
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt. Wait for the sheet titled Receipt.',
    'Press Close, then on the Draft receipt row press Resume.',
    'Press the Apply button at the bottom (if it reads "Apply anyway", press it twice: the first press asks, the second applies). This changes the prices on this test account.',
    'Look under Scan receipt.',
  ],
  expected: [
    'The resumed receipt applies and the sheet closes.',
    'The Draft receipt row is gone.',
  ],
};

export default scenario;
