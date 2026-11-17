import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-312', feature: 'Receipt back guard', title: 'Close keeps the receipt and Resume brings it back with the edits', persona: 'grocery-shopper', brief: 'receipt-back-guard',
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt. Wait for the sheet titled Receipt.',
    'Untick one line with its "Include" box, then press Close at the top of the sheet.',
    'Look under Scan receipt on Shopping, then press Resume.',
  ],
  expected: [
    'Close shuts the sheet without asking.',
    'A row reads "Resume your receipt" with the store (if one was read), the number of lines and "closed just now", and has two buttons, Resume and Discard.',
    'Resume reopens the Receipt sheet with the line still unticked, and the Resume row is hidden while the sheet is open.',
  ],
};

export default scenario;
