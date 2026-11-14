import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-60', feature: 'Receipt photos', title: 'Not ticked saves nothing; a failed or full save says so', persona: 'grocery-shopper', brief: 'receipt-save-photo', edge: true, device: true,
  steps: [
    'On a phone, scan a receipt and press Apply with the box unticked; then scan another, tick the box and press Close. Open Saved receipts.',
    'Scan a receipt, tick the box, turn on airplane mode and press Apply; turn it off and press Try again.',
  ],
  expected: [
    'Neither the unticked Apply nor the cancelled one leaves a receipt on the Saved receipts page, which says "No saved receipts yet" when it is empty.',
    'Offline, the prices still apply and the notice says the photo was not saved, with Try again; Try again saves it once. Opening a saved receipt and closing it, or pressing Retry, before the photo has loaded never shows that photo on the wrong sheet. (At 200 receipts or 60 MB the notice says to delete some in Receipts.)',
  ],
};

export default scenario;
