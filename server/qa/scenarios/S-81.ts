import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-81', feature: 'Receipt store', title: 'A store that is not on the list, and moving between sharing groups', persona: 'grocery-shopper', brief: 'receipt-bought-at', edge: true,
  steps: [
    'As an admin scan a receipt from a store that is not on your list (for example Walmart).',
    'Check the sheet: no row says Bought at, and "Store for this receipt" is set to Do not set the store or the tax. Pick Costco in it.',
    'Close the sheet. On Inventory > Edit > Sharing, make a group that splits with one person and give it Costco only; scan the receipt again with Costco picked and look under the list.',
  ],
  expected: [
    'With no store picked nothing moves and no row says Bought at; picking Costco adds the Bought at notes and the "will be marked bought at Costco" line.',
    'When the items\' old store has no sharing group and Costco has one, a warning says moving them changes who shares them; items with a split of their own are not counted in it.',
  ],
};

export default scenario;
