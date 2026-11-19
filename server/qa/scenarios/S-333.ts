import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-333', feature: 'Receipt drafts list', title: 'A draft resumed after its item was deleted keeps the receipt and sets that line to no match', persona: 'grocery-shopper', brief: 'receipt-drafts-list', edge: true,
  steps: [
    'On Shopping press Scan receipt, then Photos, and pick a photo of a receipt with at least two items from your list. Note which list item the first line is matched to, then press Save for later.',
    'Delete that item from the grocery list (the same way you edit the list), then go back to Shopping.',
    'Press Resume on the draft row.',
  ],
  expected: [
    'The Receipt sheet opens with the whole receipt, every other line as it was.',
    'A note reads "1 line was matched to an item that is no longer on your list. It is set to no match; pick another item or add it to the list."',
    'The line whose item was deleted shows no item chosen and is unticked; nothing is applied until you press Apply.',
  ],
};

export default scenario;
