import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-143', feature: 'Groceries views', title: 'Store chips filter Bought and Inventory, one column with no empty block', persona: 'grocery-shopper', brief: 'groceries-bought-inventory-lists',
  steps: [
    'On Bought press one store chip, then All. Press the Spending history switch and back to This month.',
    'Open Inventory. Press a store chip, tick a Have box inside it, then press Edit.',
  ],
  expected: [
    'A chip shows only that store; All shows every store in one column with no gap beside a short store. Spending history opens and This month comes back.',
    'Each store header reads "n items · m you have" and the count goes up with the tick. Edit shows no chips and keeps its columns; Done brings the chips back.',
  ],
};

export default scenario;
