import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-321', feature: 'receipt-rewards-credit', title: 'Keep a copy saves You paid as the receipt total', persona: 'grocery-shopper', brief: 'receipt-rewards-credit',
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a Costco receipt that prints a rewards line. Wait for the sheet titled Receipt.',
    'Note "You paid". Tick "Keep a copy of this photo", then press Apply.',
    'Wait for "Photo saved. Find it under Receipts.", then open Saved receipts (More on a phone) and look at the row for this receipt.',
    'On Saved receipts press Download all and look at the total in the file\'s list of receipts, if your device lets you open it.',
  ],
  expected: [
    'The row reads store, date, then a total equal to the "You paid" amount, not the printed Receipt total.',
    'The download carries the same You paid figure for that receipt.',
  ],
};

export default scenario;
