import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-147', feature: 'Groceries views', title: 'Moving an item to another store under a chip switches the chip to All', persona: 'grocery-shopper', brief: 'groceries-inventory-edit-list', edge: true,
  steps: [
    'In Edit mode press one store\'s chip, open an item there and change its store to another one. On a computer 1100 px or wider look at the right side.',
  ],
  expected: [
    'The chip switches to All, the cursor stays on the item\'s Store box, and the item shows under its new store. On a wide screen the Stores panel sits in the right rail; on a narrower one it sits under the list.',
  ],
};

export default scenario;
