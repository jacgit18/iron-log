import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-305', feature: 'Receipt share', title: 'Not now folds the offer to a link, and nothing is written without Apply', persona: 'grocery-shopper', brief: 'receipt-share', device: true, edge: true,
  steps: [
    'On a phone with no sharing group (see S-304), scan a receipt and press Not now on the card "Split this receipt?".',
    'Press the link "Split it".',
    'With a sharing group, scan a receipt, tick Sam in the "Split this receipt" box, then press Close without pressing Apply, and open Bought.',
  ],
  expected: [
    'Not now leaves one line, "Counts as all yours." with the link Split it; Split it brings the card back.',
    'Closing the sheet without Apply writes nothing: no line is bought and Who owes who is unchanged.',
  ],
};

export default scenario;
