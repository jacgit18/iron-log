import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-129', feature: 'Groceries views', title: 'Store chips filter Shopping, and All is one column with no empty blocks', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes',
  steps: [
    'Sign in as Grocery shopper and open Groceries, Shopping. Read the Store filter above the list (a dropdown: with four stores and All it is too many for chips; All and one entry per store, each with a count).',
    'Choose a store from the Store dropdown, then look at the list. Choose All.',
    'Make the window about 1900 px wide, then about 390 px wide, and look at the list each time.',
  ],
  expected: [
    'The Store dropdown reads All n, then each store with how many items are still to get.',
    'A chosen store shows only that store, with taller rows and no split tags; All shows every store, one under the other.',
    'At both widths the stores are in one column with no empty block beside a short store. At 1100 px and wider a rail on the right shows the summary and a Stores list that also picks the store.',
  ],
};

export default scenario;
