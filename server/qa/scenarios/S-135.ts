import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-135', feature: 'Receipt scan', title: 'Name a line that is not on your list', persona: 'grocery-shopper', brief: 'receipt-rename-memory', device: true,
  steps: [
    'On a phone, scan a receipt with a line that matched nothing. Type a name in its name field and leave the field.',
    'Press Apply, then scan the same text again.',
  ],
  expected: [
    'The line shows New with that name and a Remember tick; Apply creates the item bought with the receipt price.',
    'The second scan sets that line to the new item with the "Matched your earlier rename" chip.',
  ],
};

export default scenario;
