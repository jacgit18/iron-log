import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-87', feature: 'Bulk share', title: 'A pack-priced item takes the split on every pack, and no group means no Select items', persona: 'grocery-shopper', brief: 'grocery-bulk-share', edge: true,
  steps: [
    'On Shopping open a Costco item, give it two pack prices (Add price) and give pack 1 its own split (Sam only). Close it.',
    'Press Select items, tick that item and one other, press Change who shares, and read the sheet. Tick Alex and press Apply.',
    'Open the pack-priced item and look at both packs; press Undo on the notice within about 10 seconds (it goes away by itself).',
    'Sign in as Recipe collector (30 grocery items and no sharing group; any account that has grocery items but no sharing group will do) and open Groceries, Shopping. New user does not prove it, because its list is empty.',
  ],
  expected: [
    'The sheet says "1 picked item is priced pack by pack: every pack gets this split."',
    'After Apply both packs show Alex\'s split (pack 1\'s own split is gone); Undo brings back pack 1\'s Sam-only split.',
    'An account that has items but no sharing group has no Select items button on Shopping.',
  ],
};

export default scenario;
