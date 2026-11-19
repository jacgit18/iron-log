import type { Scenario } from '../scenarios.ts';

// ---- Receipt scan ----
const scenario: Scenario = {
  id: 'S-53', feature: 'Receipt scan', title: 'Scan a Costco receipt and apply it', persona: 'grocery-shopper', brief: 'receipt-scan', device: true,
  steps: [
    'On a phone, with items like the ones on your receipt. On Groceries, Shopping, press Scan receipt, then Camera, and photograph a Costco receipt.',
    'In the sheet, compare each line with the paper: the item it matched, the quantity and the price after the instant savings. Change one match and untick one line.',
    'Check the Total check line, pick the store for the tax if it asks, then press Apply and look at the list; then press Undo.',
  ],
  expected: [
    'The sheet lists every receipt line; a discount is taken off the item above it and the old price shows crossed out; lines with no item on your list are greyed and skipped.',
    'Apply ticks the matched items as bought this month with the right quantity and price and sets the store tax; Undo puts every price, tick and the tax back as they were.',
    'A line sold by weight (lb or oz on the paper) is converted into the item\'s own unit; Undo is held back while the app is still syncing the apply and works once it has finished.',
  ],
};

export default scenario;
