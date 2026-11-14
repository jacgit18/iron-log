import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-124', feature: 'Groceries views', title: 'The old To get and At home addresses open Shopping and Inventory', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory', edge: true,
  steps: [
    'With Groceries open, replace the end of the address with #/daily/grocery/home and press Enter.',
    'Replace it with #/daily/grocery/get and press Enter.',
  ],
  expected: [
    'The first address opens Inventory (the list you tick Have on).',
    'The second opens Shopping.',
  ],
};

export default scenario;
