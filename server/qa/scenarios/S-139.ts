import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-139', feature: 'Groceries views', title: 'On a phone Shopping has Scan receipt, a search box and Sort, Select items, More in one row', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add', device: true,
  steps: [
    'On a phone open Shopping.',
    'Look at the buttons under the month row, then press More.',
  ],
  expected: [
    'Scan receipt and the search box are full width. Sort, Select items and More are three equal buttons in one row.',
    'More holds Saved receipts and Skip the N left (Details by screen size appears there only after a details choice was made). Pick from photos is no longer there: Scan receipt opens a chooser with Camera and Photos. Show details sits under the list summary, not in More. A computer keeps its own toolbar.',
  ],
};

export default scenario;
