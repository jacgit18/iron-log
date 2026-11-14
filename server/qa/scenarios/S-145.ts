import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-145', feature: 'Groceries views', title: 'Edit on Inventory shows store chips and one list; a chip shows one store; stores fold', persona: 'grocery-shopper', brief: 'groceries-inventory-edit-list',
  steps: [
    'Open Inventory with two or more stores and press Edit. Press a store chip, then Done, then Edit again. Press a store\'s name to fold it, then press it again.',
  ],
  expected: [
    'Chips with counts show above one list of stores (no columns). A chip shows one store and stays across Done and Edit. A folded store shows only its name and count; opening it brings the rows back. There is no Sort in Edit mode.',
  ],
};

export default scenario;
