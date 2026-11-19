import type { Scenario } from '../scenarios.ts';

// Draft: labels not checked (written at the Ready gate from the brief; re-check against src/ after the build).
const scenario: Scenario = {
  id: 'S-350', feature: 'Snap now, log later', title: 'A failed Snap & save upload keeps the photo and offers Try again', persona: 'grocery-shopper', brief: 'receipt-snap-now-log-later', edge: true,
  steps: [
    'Open Groceries, then Shopping. Turn the network off (airplane mode, or Offline in the browser).',
    'Press Snap & save and choose a receipt photo.',
    'Look at what the screen says. Turn the network back on and press Try again.',
    'Reload and check the To log card.',
  ],
  expected: [
    'The upload fails with a notice and a Try again button; the photo is still held on screen, not lost.',
    'After Try again with the network on, the receipt appears under To log.',
    'It appears once, not twice, after the reload.',
  ],
};

export default scenario;
