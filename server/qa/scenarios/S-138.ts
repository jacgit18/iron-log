import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-138', feature: 'Groceries views', title: 'Spending history is inside Bought, and the old Spending address opens it', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add',
  steps: [
    'Open Groceries. Look at the three views, then open Bought.',
    'Press Spending history, then reload the page. Then open the address ending /daily/grocery/spend.',
  ],
  expected: [
    'The views read Shopping, Bought and Inventory. Bought has This month and Spending history under its title.',
    'Spending history shows the chart, the 6 mo and 12 mo buttons and the text lines. The reload and the old address both open it.',
  ],
};

export default scenario;
