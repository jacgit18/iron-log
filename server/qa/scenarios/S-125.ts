import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-125', feature: 'Groceries views', title: 'On a phone at large text the four views wrap and nothing scrolls sideways', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory', device: true, edge: true,
  steps: [
    'On a phone set the text size to its largest and open Groceries.',
    'Look at the four views, then open Inventory and look at the Sharing groups and Edit buttons.',
  ],
  expected: [
    'The four views wrap onto more than one row; every one can be tapped and the page does not scroll sideways.',
    'Sharing groups and Edit wrap under each other instead of running off the edge.',
  ],
};

export default scenario;
