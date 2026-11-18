import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-339', feature: 'Group share across stores', title: 'Who owes who shows everyone\'s Paid and Share over all stores, with an All row that is the bills', persona: 'grocery-shopper', brief: 'group-share-across-stores',
  steps: [
    'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
    'On Shopping tick two priced items from Costco (it splits with Home) and one priced item from a second store, so two stores are bought from this month.',
    'Open Bought, then press the Who owes who row. Look in the "Across all stores" block, under the lines that say who owes you.',
  ],
  expected: [
    'Under those lines is a table titled "Everyone across all stores" with the columns Person, Paid and Share, and a final row All.',
    'You is the first row; Sam and Alex follow with their share of the Costco items (and of the other store if it is split), and a person with no money at all has no row.',
    'In the All row, Paid and Share are the same amount, and it equals the total of the store bills. The note under the table reads "Share is what each person\'s items and tax come to, over all stores. Mark paid does not change it."',
  ],
};

export default scenario;
