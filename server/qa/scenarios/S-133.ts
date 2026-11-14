import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-133', feature: 'Receipt scan', title: 'Rename a matched receipt line and apply', persona: 'grocery-shopper', brief: 'receipt-rename-memory', device: true,
  steps: [
    'On a phone, scan a receipt. Find a line that matched an item and look at its name field and the area under it.',
    'Type a different name in that line’s name field, leave the field, and look under it. Leave Remember this name ticked and press Apply.',
  ],
  expected: [
    'Every line has a name field. A match you have not touched shows no Remember tick.',
    'Remember this name appears once the name changed, ticked. After Apply the item has the new name and the notice says "Remembered 1 receipt name."; Undo puts the old name back.',
  ],
};

export default scenario;
