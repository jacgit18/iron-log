import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-291', feature: 'Joined week and day tabs', title: 'Stretches on a phone: Sun to Sat with counts in the same card, one-line week row', persona: 'heavy-logger', brief: 'week-day-joined-tabs',
  steps: [
    'On a phone (375 px wide) open Board, then Stretches. Read the card.',
    'Tick all of one day done, then read its tab.',
  ],
  expected: [
    'The card holds the week arrows with the dates on one line and seven tabs, Sun to Sat, each with its count; there is no "N of 7 days done" line and the card stays pinned while scrolling.',
    'That day\'s tab shows the check.',
  ],
};

export default scenario;
