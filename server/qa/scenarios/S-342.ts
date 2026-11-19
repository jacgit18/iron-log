import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-342', feature: 'Joined week and day tabs', title: 'Board on a phone: the card holds the filter row, week row, day tabs and Body weight, and the filter row scrolls away', persona: 'heavy-logger', brief: 'board-card-filters-weight',
  steps: [
    'On a phone (375 px wide) open Board. Read the card from the top: Sort button, Injury prevention, the week arrows, D1 to D7, Body weight.',
    'Scroll down through the exercise cards.',
    'Scroll back to the top and tap another day tab.',
  ],
  expected: [
    'One bordered card holds, top to bottom: a row with the Sort button at the left and Injury prevention at the right, a hairline, the week row, the day tabs, and Body weight (with Save or Edit) under the tabs. Nothing else sits between the card and the exercise cards except any notices, which are below the card.',
    'The Sort row scrolls up out of view; the week row, the day tabs and Body weight stay pinned at the top and are never covered by the cards.',
    'The tapped tab selects its day and the page returns to the top, with the Sort row showing again.',
  ],
};

export default scenario;
