import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-132', feature: 'Groceries views', title: 'A ticked item with no price offers Add price, and Bought shows an Add price chip', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes', edge: true,
  steps: [
    'On Shopping tick an item that has no price (its count says "no price").',
    'Press Add price in the notice. Then look at the item on Bought.',
  ],
  expected: [
    'The notice reads "Bought <item>. It has no price yet." with Undo, Add price and Dismiss.',
    'Add price opens Bought with that item\'s price field open. A bought item with no price shows an Add price chip in place of its count and price.',
  ],
};

export default scenario;
