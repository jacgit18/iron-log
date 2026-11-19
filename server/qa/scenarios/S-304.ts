import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-304', feature: 'Receipt share', title: 'With no sharing group the sheet offers one and brings the receipt back', persona: 'grocery-shopper', brief: 'receipt-share', device: true,
  steps: [
    'On a phone, open Inventory, press Sharing groups and remove the group Home (this test account only), then close the panel.',
    'On Shopping press Scan receipt, then Camera, and photograph a receipt with items from your list.',
    'In the sheet read the card under the total check, then press "Make a sharing group".',
    'In Sharing groups type the group name Home and the people Sam, Alex, press Add group, then Done.',
  ],
  expected: [
    'The card reads "Split this receipt?" and says you have no sharing group, so the receipt counts as all yours; it has Not now and Make a sharing group.',
    'Make a sharing group closes the sheet and opens Inventory with the Sharing panel open.',
    'After Done the same receipt is open again, with the "Split this receipt" box and a chip under each ticked line.',
  ],
};

export default scenario;
