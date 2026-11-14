import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-86', feature: 'Bulk share', title: 'The usual-split box changes Inventory, and this month only is the default', persona: 'grocery-shopper', brief: 'grocery-bulk-share',
  steps: [
    'On Shopping, press Select items and tick two Costco items and press Change who shares Tick Alex only and press Apply (leave "Also make this the usual split" unticked).',
    'Open Inventory, press Edit, then press "Adjust shares for Costco" so every Costco row shows its split picker (a closed row names a split only when the item has its own). Read the same two items. Then go back to Shopping, press Select items, pick the same two items, tick Sam only, tick "Also make this the usual split for these items" and press Apply.',
    'Open Inventory, Edit, Adjust shares for Costco again and look at the same items\' split.',
  ],
  expected: [
    'After the first Apply Shopping shows the new split but Inventory still shows the store\'s split for those items (this month only).',
    'After the second Apply Inventory shows Sam as the items\' usual split, and the notice\'s Undo restores both the rows and the usual split.',
  ],
};

export default scenario;
