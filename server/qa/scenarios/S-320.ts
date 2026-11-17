import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-320', feature: 'Receipt drafts list', title: 'A sixth draft drops the oldest one', persona: 'grocery-shopper', brief: 'receipt-drafts-list', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, pick a photo of a receipt, wait for the sheet titled Receipt and press Save for later. Do this five times, using a photo that looks different each time if you can (a different store or date), and note which was first.',
    'Look at the Drafts block under Scan receipt.',
    'Scan a sixth receipt the same way and press Save for later.',
    'Look at the Drafts block again.',
  ],
  expected: [
    'After five the block is headed "Draft receipts (5)" with five rows.',
    'After the sixth it is still headed "Draft receipts (5)": the newest row is there and the oldest one (the first you saved) is gone, with no message.',
  ],
};

export default scenario;
