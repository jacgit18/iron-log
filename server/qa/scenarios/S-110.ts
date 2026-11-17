import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-110', feature: 'Receipt store', title: 'A store the list does not have is added from the receipt', persona: 'grocery-shopper', brief: 'receipt-add-store', device: true,
  steps: [
    'On your own admin account on a phone (the QA test accounts are not admins and have no Scan receipt button), open Groceries, Inventory, Edit and check the list does not have the store on your receipt (for example Safeway, which Grocery shopper does not have); other stores may stay.',
    'On Shopping press Scan receipt, then Camera, and photograph a receipt from a store (for example Safeway) that has a few items from your list.',
    'In the sheet read the box under the store line and the line under the list; do not press Apply yet.',
    'Press Apply, then open Shopping and Inventory, then press Undo on the notice.',
  ],
  expected: [
    'A ticked box says "Add this store to your stores" with a tidy name in the box (SAFEWAY #123 reads Safeway); the line under the list says how many items will be marked bought at it this month. Nothing is added before Apply.',
    'After Apply the store exists, the notice says "Added the store Safeway.", and Shopping lists the matched items under Safeway, ticked and priced.',
    'Undo removes the store again and puts the items back and unticked.',
  ],
};

export default scenario;
