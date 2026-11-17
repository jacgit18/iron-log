import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-307', feature: 'Receipt scan', title: 'The chooser closes on a second press, Escape or a tap elsewhere, and focus returns to Scan receipt', persona: 'grocery-shopper', brief: 'receipt-pick-photo', edge: true,
  steps: [
    'On a computer open Groceries, then Shopping, and press Scan receipt.',
    'Press Scan receipt a second time.',
    'Press Scan receipt again, then press the Escape key.',
    'Press Scan receipt again, then tap somewhere else on the page (on a phone, tap More).',
    'Press Scan receipt, then press Camera or Photos and cancel the phone or file picker.',
  ],
  expected: [
    'The second press closes the chooser: Camera and Photos are gone.',
    'Escape closes the chooser and the cursor is back on Scan receipt (it shows its focus ring).',
    'A tap elsewhere closes the chooser (the More menu still opens on a phone).',
    'After a pick the chooser is closed and the cursor is back on Scan receipt.',
  ],
};

export default scenario;
