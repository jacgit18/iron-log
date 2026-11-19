import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-309', feature: 'Receipt back guard', title: 'Back on a receipt with a changed line asks first and Keep editing returns with the change', persona: 'grocery-shopper', brief: 'receipt-back-guard',
  steps: [
    'Open Groceries, then Shopping, press Scan receipt, then Photos, and pick a photo of a receipt with a few items from your list. Wait for the sheet titled Receipt.',
    'Untick one line with its "Include" box (do not press Apply).',
    'Press Back (the browser Back button, or the Back swipe on a phone).',
    'Press Keep editing.',
    'Press Back again.',
  ],
  expected: [
    'The sheet stays open and the bar at the bottom, where Apply was, now reads "Leave this receipt?" with "Your changes are not applied yet. Discard erases them." and two buttons, Keep editing and Discard.',
    'Keep editing brings the Apply bar back; the line you unticked is still unticked and every other choice is as you left it.',
    'The second Back asks again in the same way instead of closing the sheet.',
  ],
};

export default scenario;
