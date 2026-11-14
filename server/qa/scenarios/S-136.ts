import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-136', feature: 'Receipt scan', title: 'A receipt text saved for another item moves', persona: 'grocery-shopper', brief: 'receipt-rename-memory', edge: true, device: true,
  steps: [
    'On a phone, scan a receipt, pick an item that already holds a receipt name on a line with that text, choose a different item for the line, and read under the name field.',
    'Press Apply, then open the first item’s edit row in Inventory.',
  ],
  expected: [
    'A note says the text is saved for the first item and that remembering it moves it here.',
    'The text is now listed under the new item and no longer under the first.',
  ],
};

export default scenario;
