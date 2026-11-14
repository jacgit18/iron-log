import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-134', feature: 'Receipt scan', title: 'Scan again and see the saved name matched', persona: 'grocery-shopper', brief: 'receipt-rename-memory', device: true,
  steps: [
    'On a phone, scan a receipt that has the same printed line text as the one you renamed.',
    'Look at that line’s item and the chip beside its name.',
  ],
  expected: [
    'The line is already set to your item, with the chip "Matched your earlier rename", whatever the scan guessed.',
    'Changing the item on that line removes the chip.',
  ],
};

export default scenario;
