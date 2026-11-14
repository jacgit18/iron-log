import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-131', feature: 'Groceries views', title: 'Row details start open on a computer and closed on a phone, and the More menu choice sticks', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes', device: true, edge: true,
  steps: [
    'On a computer open Shopping and look at the rows. Then open the same page on a phone.',
    'On the phone press Show details above the list. Reload the page.',
  ],
  expected: [
    'On the computer every row shows its count, price, Move to and Shared with. On the phone every row is closed.',
    'After the choice every row on the phone is open, and it is still open after the reload (the choice is kept on that phone only).',
  ],
};

export default scenario;
