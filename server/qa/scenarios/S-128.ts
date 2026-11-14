import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-128', feature: 'Receipt scan', title: 'The last receipt row clears the bar and the row links are easy to hit', persona: 'grocery-shopper', brief: 'receipt-apply-footer', edge: true, device: true,
  steps: [
    'On a phone, scan a long receipt with at least one line that is not on your list, and scroll to the end of the sheet.',
    'Tap Add to list on that line, add the item, then tap Remove on its row.',
  ],
  expected: [
    'The last row ends above the bottom bar with clear space, and the bar stays above the phone\'s bottom edge.',
    'Add to list and Remove are text links with room around them; each takes one tap and neither lands on the bar.',
  ],
};

export default scenario;
