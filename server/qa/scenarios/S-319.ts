import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-319', feature: 'receipt-rewards-credit', title: 'Apply takes the rewards off Spent and a Rewards box sits beside Tax', persona: 'grocery-shopper', brief: 'receipt-rewards-credit',
  steps: [
    'On Shopping note the Spent figure in the summary card. Press Scan receipt, then Photos, and pick a photo of a Costco receipt that prints a rewards line and a tax line. Wait for the sheet titled Receipt.',
    'Press Apply (the button with the item count and amount).',
    'Open Bought and look at the summary card, then at Costco\'s heading in the list.',
    'In the Rewards box beside Tax under Costco type 7.00 and press Enter. Then type x and press Enter. Then clear the box and press Enter.',
  ],
  expected: [
    'Before Apply the line above the Apply button reads "... + Costco tax $X - rewards $Y" with both amounts from the receipt.',
    'The notice reads "Applied N items and Costco tax for <month>." with Undo, and Spent for Costco is the ticked items plus tax minus the rewards (never below $0.00); the Spending history chart for the month shows the same figure.',
    'Under Costco a Rewards checkbox and a "$" box sit beside the Tax checkbox and box, with the receipt\'s rewards amount filled in.',
    'Typing 7.00 changes Spent by the difference; x shows "Rewards is dollars, like 17.27." and the box goes back to 7.00 with nothing written; clearing it removes the credit and Spent goes up to items plus tax.',
  ],
};

export default scenario;
