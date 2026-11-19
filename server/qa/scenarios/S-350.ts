import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-350', feature: 'Snap now, log later', title: 'A failed Snap & save upload keeps the photo and offers Try again', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Open Groceries, then Shopping. Turn the network off (airplane mode, or Offline in the browser).',
    'Press Scan receipt, then Snap & save, and choose a receipt photo.',
    'Look at what the screen says. Turn the network back on and press Try again.',
    'Reload and check the To log card.',
  ],
  expected: [
    'A warning notice says "The photo was not saved. You are offline. Try again when you are back online." with Try again and Dismiss; no To log row was added.',
    'After Try again with the network on, a row appears under "To log (1)" without choosing the photo again.',
    'It appears once, not twice, after the reload.',
  ],
};

export default scenario;
