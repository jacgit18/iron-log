import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-84', feature: 'Receipt merge', title: 'Show these lines separately', persona: 'grocery-shopper', brief: 'receipt-merge-lines', edge: true,
  steps: [
    'As an admin, scan a receipt with the same item on two lines (no match on your list).',
    'On the merged row press "Show these lines separately".',
    'Press Add to list on the first row and add it, then press Add to list on the second row with the same name and press Add item.',
  ],
  expected: [
    'The row splits into its original rows (nothing is saved yet) and the link goes away.',
    'The second add is refused with "That item is already in this store\u2019s list. Pick it in the list instead.", as it always was; picking the first row\u2019s new item in the second row\u2019s picker joins them.',
  ],
};

export default scenario;
