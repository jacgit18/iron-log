import type { Scenario } from '../scenarios.ts';

// ---- Bulk share ----
const scenario: Scenario = {
  id: 'S-85', feature: 'Bulk share', title: 'Select all in Costco, share with one person, and Undo', persona: 'grocery-shopper', brief: 'grocery-bulk-share',
  steps: [
    'Sign in as Grocery shopper (it has a sharing group, Home with Sam and Alex, that Costco splits with). Open Groceries, Shopping.',
    'Press Select items. A checkbox appears on each row, each store heading says "Select all in ...", and a bar at the bottom says "0 selected".',
    'Press "Select all in Costco", then Change who shares In the sheet tick Sam only and press Apply.',
    'Look at the Costco rows and the notice, then press Undo within about 10 seconds (the notice goes away by itself).',
  ],
  expected: [
    'Nothing changes until Apply; the bar counts the Costco items and Change who shares is off while nothing is selected.',
    'Every Costco row now says "Me +1" (it said "Me +2" before), the notice reads "Shared N items: Me +1.", Select mode is off and focus is on the Select items button.',
    'Undo puts every row back to "Me +2".',
  ],
};

export default scenario;
