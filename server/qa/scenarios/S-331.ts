import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-331', feature: 'Receipt drafts list', title: 'Two unfinished receipts are two rows; Resume and Apply touch only their own', persona: 'grocery-shopper', brief: 'receipt-drafts-list',
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of one receipt. Wait for the sheet titled Receipt, then press Close.',
    'Press Scan receipt again and pick a photo of a different receipt (another store if you have one). Untick one line with its "Include" box, then press Save for later.',
    'Look under Scan receipt, then press Resume on the second receipt\'s row.',
    'Press the Apply button at the bottom (if it reads "Apply anyway", press it twice: the first press asks, the second applies). This changes the prices on this test account.',
    'Look under Scan receipt, then press Discard on the remaining row.',
  ],
  expected: [
    'The block is headed "Draft receipts (2)" with "Kept on this device for 7 days" and has two rows, each with its own store and date and its own Resume and Discard buttons.',
    'Resume opens the second receipt with its line still unticked, not the first one.',
    'After Apply the sheet closes and only the first receipt\'s row is left, headed "Draft receipt".',
    'Discard removes the last row and the whole Drafts block disappears.',
  ],
};

export default scenario;
