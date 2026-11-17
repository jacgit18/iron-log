import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-307', feature: 'Receipt scan', title: 'The chooser closes on a second press or Escape, and Escape returns to Scan receipt', persona: 'grocery-shopper', brief: 'receipt-pick-photo', edge: true,
  steps: [
    'On a computer open Groceries, then Shopping, and press Scan receipt.',
    'Press Scan receipt a second time.',
    'Press Scan receipt again, then press the Escape key.',
  ],
  expected: [
    'The second press closes the chooser: Camera and Photos are gone.',
    'Escape closes the chooser and the cursor is back on Scan receipt (it shows its focus ring).',
  ],
};

export default scenario;
