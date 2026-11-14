import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-80', feature: 'Receipt store', title: 'Make the receipt\'s store the usual store, and a name already there is refused', persona: 'grocery-shopper', brief: 'receipt-bought-at', edge: true,
  steps: [
    'As an admin, add an item named Oats to Costco on Inventory (Edit), and make sure another item named Oats is under Trader Joe\'s.',
    'Scan a Costco receipt that has an oats line matched to the Trader Joe\'s Oats, and a second item matched to something under another store.',
    'In the sheet read the line under the Also make Costco box (it starts unticked because the items already have usual stores), then tick "Also make Costco the usual store for these items" and press Apply.',
    'Look at the notice and Inventory, then press Undo.',
    'Scan a Costco receipt where every matched item is under Anywhere on Inventory (no usual store). Read the box and the line under it before pressing Apply.',
  ],
  expected: [
    'The second item moves to Costco on Inventory; the Trader Joe\'s Oats stays under Trader Joe\'s (an Oats is already at Costco) but is still bought at Costco this month, and the notice says "except Oats" with the reason.',
    'Undo restores the usual store of the item that moved, and both lines go back to unticked.',
    'Before you tick the box the line reads "Inventory stays as it is. Tick the box to list these under Costco there."; ticked, it reads "Inventory will list these under Costco."',
    'When every item that moves is under Anywhere, "Also make Costco the usual store for these items" starts ticked and the line reads "Inventory will list these under Costco."; when any of them already has a usual store it starts unticked.',
  ],
};

export default scenario;
