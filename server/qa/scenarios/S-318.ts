import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-318', feature: 'Receipt drafts list', title: 'A saved draft is still listed after the page is reloaded', persona: 'grocery-shopper', brief: 'receipt-drafts-list',
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt. Wait for the sheet titled Receipt.',
    'Untick one line with its "Include" box, then press Save for later.',
    'Reload the page, open Groceries, then Shopping.',
    'Press Resume on the row under Scan receipt.',
  ],
  expected: [
    'After the reload the "Draft receipt" block still shows the row, with its age now counting from when you saved it (for example "saved 2 min ago").',
    'Resume reopens the Receipt sheet with the line still unticked.',
  ],
};

export default scenario;
