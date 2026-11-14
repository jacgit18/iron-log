import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-111', feature: 'Receipt store', title: 'Edit the new store name, or untick the box and nothing is added', persona: 'grocery-shopper', brief: 'receipt-add-store', edge: true,
  steps: [
    'On your admin account, with the receipt\'s store not on the list, scan a receipt from that store.',
    'Change the name in the box to something else, and press Apply. Press Undo.',
    'Scan again, untick "Add this store to your stores", look at the sheet, and press Apply.',
    'Add a store named like the receipt\'s (Edit, Stores), then scan once more.',
    'With the receipt\'s store still not on the list and the box ticked, scan a receipt that has a line your list does not have. On that line press Add to list, read the Store choice, add the item, then untick "Add this store to your stores" and press Apply.',
  ],
  expected: [
    'The store is added under the name you typed, and Undo removes it.',
    'With the box unticked the name box disappears, no "will be marked bought" line shows, and Apply adds no store.',
    'When the list already has the store there is no box and the items are marked bought at it as before.',
    'The Store choice lists the new store (for example "Safeway (new)") after Anywhere and starts on it; you can still pick Anywhere or another store. Unticking the box moves the item to Anywhere, and no store is added.',
  ],
};

export default scenario;
