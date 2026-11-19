import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-316', feature: 'Receipt back guard', title: 'The Back swipe with the keyboard open asks first', persona: 'grocery-shopper', brief: 'receipt-back-guard', device: true,
  steps: [
    'On a phone, on Shopping press Scan receipt, then Camera, and photograph a receipt with items from your list.',
    'In the Receipt sheet press a Name box or the price field so the keyboard opens, and change something.',
    'Swipe Back from the edge of the screen once (the swipe that would normally put the keyboard away), then swipe Back a second time.',
  ],
  expected: [
    '"Leave this receipt?" shows with Keep editing and Discard and the receipt is still visible above it.',
    'The second swipe stays on the prompt: the sheet is not closed and nothing is erased until you press Discard.',
  ],
};

export default scenario;
