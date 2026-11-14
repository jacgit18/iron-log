import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-142', feature: 'Groceries views', title: 'Bought has one Who owes who row and no money line under the month switcher', persona: 'grocery-shopper', brief: 'groceries-bought-inventory-lists',
  steps: [
    'Open Groceries, then Bought (This month). Look at what sits above the store sections, then press the Who owes who row.',
  ],
  expected: [
    'Who owes who is the first row, closed, above the month switcher. There is no line reading Paid, Your share and Owed to you under the switcher. Opening the row shows Paid, Your share and Still owed to you.',
  ],
};

export default scenario;
