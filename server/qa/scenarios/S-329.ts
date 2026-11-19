import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-329', feature: 'Receipt drafts list', title: 'Save for later keeps the receipt and its edits, closes with no prompt and adds a Drafts row', persona: 'grocery-shopper', brief: 'receipt-drafts-list',
  steps: [
    'Open Groceries, then Shopping, press Scan receipt, then Photos, and pick a photo of a receipt with a few items from your list. Wait for the sheet titled Receipt.',
    'Untick one line with its "Include" box.',
    'Press Save for later, next to the Apply button at the bottom of the sheet.',
    'Look under Scan receipt on Shopping, then press Resume on the new row.',
  ],
  expected: [
    'The sheet closes at once with no "Leave this receipt?" bar.',
    'A block headed "Draft receipt" with "Kept on this device for 7 days" shows one row: the store and date (for example "BJ\'S, Nov 16") in bold, then the number of lines, the total and "saved just now", with two buttons, Resume and Discard.',
    'Resume reopens the Receipt sheet with the line still unticked.',
  ],
};

export default scenario;
