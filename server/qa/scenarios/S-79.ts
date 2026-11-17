import type { Scenario } from '../scenarios.ts';

// ---- Receipt store ----
const scenario: Scenario = {
  id: 'S-79', feature: 'Receipt store', title: 'A scanned receipt marks the items as bought at its store', persona: 'grocery-shopper', brief: 'receipt-bought-at', device: true,
  steps: [
    'On a phone (Grocery shopper has Costco, Trader Joe\'s, Farmers market and Corner shop). On Groceries, Inventory, make sure a few items you also bought on your receipt are listed under other stores or Anywhere (add them with Edit if needed).',
    'On Shopping press Scan receipt, then Camera, and photograph a Costco receipt (or press Photos instead of Camera and choose a saved photo of one; any store that is on your list works).',
    'In the sheet read the rows and the line under the list, then press Apply.',
    'Open Shopping and Inventory, then press Undo on the notice.',
  ],
  expected: [
    'Every ticked item that is not already at the receipt\'s store says "Bought at Costco (usually ...)" and a line says how many items will be marked bought at Costco this month; nothing is saved before Apply.',
    'After Apply Shopping shows those items under Costco, ticked and priced, the store\'s bill and tax follow, and Inventory still lists each item under its old store.',
    'Undo puts every item back to its old store and unticks it.',
  ],
};

export default scenario;
