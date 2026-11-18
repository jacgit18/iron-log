import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-341', feature: 'Group share across stores', title: 'No table with one store, and none without a sharing group', persona: 'grocery-shopper', brief: 'group-share-across-stores', edge: true,
  steps: [
    'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
    'On Shopping tick one priced item at a single store, open Bought and press the Who owes who row.',
    'Switch to the New user account (no sharing group), open Groceries, add and tick a priced item at two different stores, and open Bought.',
  ],
  expected: [
    'With one store bought from there is no "Everyone across all stores" table and no "Across all stores" block.',
    'Without a sharing group there is no Who owes who row and no table, even with two stores.',
  ],
};

export default scenario;
