import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-343', feature: 'Joined week and day tabs', title: 'Board on a phone: Sort opens the sheet, and a filter shows a badge and summary in the card', persona: 'heavy-logger', brief: 'board-card-filters-weight', edge: true,
  steps: [
    'On a phone (375 px wide) open Board and press Sort in the top row of the card.',
    'In the sheet "Sort & filter" pick a muscle under "Sort by muscle", pick an equipment under Equipment, and press Show cards.',
    'Read the top of the card and scroll down: the pinned part of the card (week row, day tabs, Body weight) should stay in view.',
    'Press Clear in the card\'s summary row, then flip Injury prevention.',
  ],
  expected: [
    'The existing sheet "Sort & filter" opens with "Sort by muscle", Equipment, Clear and Show cards.',
    'The Sort button shows a count badge and a summary line (with Clear) appears in the top row of the card, which grows taller; the week row, day tabs and Body weight remain under it, and the cards are sorted and filtered.',
    'When the page scrolls, the taller top row still scrolls out of view and the week row, day tabs and Body weight stay pinned fully visible.',
    'Clear removes the badge and summary and the card returns to its first height. Injury prevention flips between On and Off.',
  ],
};

export default scenario;
