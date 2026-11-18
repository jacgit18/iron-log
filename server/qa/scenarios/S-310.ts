import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-310', feature: 'Receipt back guard', title: 'Discard on the leave prompt closes the receipt and leaves nothing to resume', persona: 'grocery-shopper', brief: 'receipt-back-guard', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt. Wait for the sheet titled Receipt.',
    'Untick one line with its "Include" box, then press Back.',
    'On the "Leave this receipt?" bar press Discard.',
  ],
  expected: [
    'Discard closes the sheet and nothing was applied: the Shopping summary is unchanged.',
    'No "Draft receipt" row shows under Scan receipt.',
  ],
};

export default scenario;
