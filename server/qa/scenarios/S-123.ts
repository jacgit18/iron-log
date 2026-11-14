import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-123', feature: 'Groceries views', title: 'On Bought, select all in a store, change who shares, and Undo', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory',
  steps: [
    'Tick two Costco items on Shopping, then open Bought.',
    'Press Select items, then "Select all in Costco", then "Change who shares". In the sheet tick Sam only and press Apply.',
    'Look at the two rows and the notice, then press Undo within about 10 seconds (the notice goes away by itself).',
  ],
  expected: [
    'The bar says "2 selected" and nothing changes until Apply.',
    'Both rows say "Me +1" and the notice reads "Shared 2 items: Me +1."',
    'Undo puts both rows back to their earlier split.',
  ],
};

export default scenario;
