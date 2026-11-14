import type { Scenario } from '../scenarios.ts';

// ---- Groceries views ----
const scenario: Scenario = {
  id: 'S-122', feature: 'Groceries views', title: 'A tick on Shopping moves the item to Bought, and the box on Bought puts it back', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory',
  steps: [
    'Sign in as Grocery shopper and open Groceries. Read the three views; the buttons carry no counts.',
    'Tick the box of one item on Shopping. Look at the "n to get" line and the notice, then open Bought.',
    'On Bought, tick the same item\'s box. Then reload the page.',
  ],
  expected: [
    'The views read Shopping, Bought and Inventory with no counts on the buttons (Spending history is inside Bought).',
    'The item leaves Shopping, the "n to get" line goes down by one, and a notice says "Bought <item>." with Undo. Bought lists it under its store.',
    'The item is back on Shopping and the to-get count returns. After the reload the same view is open (the address names it).',
  ],
};

export default scenario;
