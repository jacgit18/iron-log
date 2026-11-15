import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-57', feature: 'Receipt scan', title: 'Add an unmatched receipt line to the list', persona: 'grocery-shopper', brief: 'receipt-add-item', device: true,
  steps: [
    'On a phone, scan a Costco receipt that has a line your list does not have (for example a soda).',
    'On that line press Add to list. Check the name, store, count and price the form filled in, then press Add item.',
    'Look at the row and the footer, then press Apply and open the Shopping list and Bought this month. Then press Undo.',
  ],
  expected: [
    'The form starts with the receipt text tidied (Zevia soda 12pk), the receipt\'s store (or Anywhere), the count and the price after any savings; Add item marks the row New and the footer says 1 new item will be added, with nothing yet on the list.',
    'Apply adds the item under that store, ticked bought with the receipt price; Undo removes it again along with the other prices and ticks.',
  ],
};

export default scenario;
