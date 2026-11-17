import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-324', feature: 'receipt-rewards-credit', title: 'In a sharing group the rewards are shared like tax', persona: 'grocery-shopper', brief: 'receipt-rewards-credit', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a Costco receipt that prints a rewards line (Costco splits with Home: Sam and Alex). Wait for the sheet titled Receipt.',
    'Leave the split as the sheet offers it, then press Apply.',
    'Open Bought and scroll to "Who owes who". Note Paid, Your share and Still owed to you, then the Costco card.',
    'Clear the Rewards box under Costco on the same page and look at Who owes who again.',
  ],
  expected: [
    'Paid equals the shared items plus tax minus the rewards, and Your share is your part of that, with any odd cent on you.',
    'The Costco card shows each person\'s amount lower than it would be without the credit, in proportion to what each person\'s items cost, like tax.',
    'After clearing the box, Paid, Your share and each person\'s amount rise by the credit.',
  ],
};

export default scenario;
