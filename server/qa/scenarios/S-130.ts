import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-130', feature: 'Groceries views', title: 'Who owes who is the first row on Bought and is gone from Shopping', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes',
  steps: [
    'Tick two Costco items on Shopping. Look for Who owes who on Shopping.',
    'Open Bought and look at the top of the page. Press the Who owes who row.',
  ],
  expected: [
    'Shopping has no Who owes who row and no money line over the list.',
    'Bought starts with a closed Who owes who row that says what is outstanding; pressing it opens the split card in place.',
  ],
};

export default scenario;
