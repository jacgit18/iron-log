import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-144', feature: 'Groceries views', title: 'On a wide screen the right rail lists the stores and picks the chip on Bought and Inventory', persona: 'grocery-shopper', brief: 'groceries-bought-inventory-lists', edge: true,
  steps: [
    'On a computer at 1280 px or wider open Bought, then Inventory. Press a store in the rail on each, then make the window narrower than 1100 px.',
  ],
  expected: [
    'The rail lists the stores with counts; on Inventory it also says "m of n items this month". Pressing a store picks that chip. Under 1100 px there is no rail and the chips still work.',
  ],
};

export default scenario;
