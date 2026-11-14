import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-290', feature: 'Joined week and day tabs', title: 'Board on a phone: the week row and D1 to D7 are one pinned card under the filter row', persona: 'heavy-logger', brief: 'week-day-joined-tabs',
  steps: [
    'On a phone (375 px wide) open Board. Read the order from the top: Injury prevention and filter row, week arrows, D1 to D7, Body weight, then any notices.',
    'Scroll down through the exercise cards. Tap another day tab, then press the Right arrow and Home on the keyboard.',
    'Press Next week, then This week.',
  ],
  expected: [
    'One bordered card holds the week arrows on top and the seven day tabs under them, the selected day underlined; there is no separate week bar above the filter row. Body weight sits under the card.',
    'The whole card stays pinned at the top while the cards scroll. A tapped tab selects its day and the page returns to the top; the arrow keys, Home and End move between tabs.',
    'The week changes and the tabs show that week\'s counts, a Rest day tab keeps "Rest" and a finished day keeps its check.',
  ],
};

export default scenario;
