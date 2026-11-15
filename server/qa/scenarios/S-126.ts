import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-126', feature: 'Receipt scan', title: 'Apply the receipt with one wide button, and Close never applies', persona: 'grocery-shopper', brief: 'receipt-apply-footer', device: true,
  steps: [
    'On a phone, scan a Costco receipt whose lines add up to its total. Read the bar at the bottom and the top corner of the sheet.',
    'Press Close in the top corner. Scan again, scroll the sheet up and down with your thumb near the bottom edge, then press the wide Apply button once.',
  ],
  expected: [
    'The top corner has Close and the bottom bar has one wide button that says what it will do, such as "Apply 5 items, $40.69", with a line above it counting the items and tax; there is no Cancel beside it.',
    'Close changes nothing on the list; scrolling never applies anything; one tap on Apply applies, and the Undo notice stays for 10 seconds.',
  ],
};

export default scenario;
