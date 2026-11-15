import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-164', feature: 'Grocery budget', title: 'Edit the budget, then remove it', persona: 'grocery-shopper', brief: 'grocery-budget',
  steps: [
    'Press Edit, change the amount to 600 and press Save.',
    'Press Edit again, press Remove and then Tap again to remove (the first tap only arms it and the budget stays), then reload the page.',
  ],
  expected: [
    'The card shows "of $600.00" and the bar shrinks to match.',
    'The card goes back to Monthly budget with Set a budget, and stays that way after the reload. The budget is kept in your settings, so it also shows on another device you are signed in on.',
  ],
};

export default scenario;
