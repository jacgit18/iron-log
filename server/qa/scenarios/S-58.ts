import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-58', feature: 'Receipt scan', title: 'Close, remove or repeat a new item', persona: 'grocery-shopper', brief: 'receipt-add-item', edge: true, device: true,
  steps: [
    'On a phone, on the receipt sheet press Add to list on a line, then Not now. Add it again, press Remove on the row, add it again and press Close at the top of the sheet.',
    'Press Add to list on a line and type the name of an item that is already in that store (such as Eggs 1), then press Add item. Empty the name and press Add item.',
  ],
  expected: [
    'Not now, Remove and Close each leave the list exactly as it was.',
    'A name already in that store says it is already in the list and to pick it instead; an empty name says to give the item a name; neither adds anything to the row.',
  ],
};

export default scenario;
