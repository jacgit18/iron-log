import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-293', feature: 'Joined week and day tabs', title: 'The card on the smallest phone and at large text', persona: 'heavy-logger', brief: 'week-day-joined-tabs', edge: true,
  steps: [
    'Set the screen to 320 px wide and the text size to 200%. On Board, Stretches and Nutrition read the card.',
    'Scroll sideways.',
  ],
  expected: [
    'The week arrows, dates and all seven tabs are inside the card; a tab\'s text wraps inside its cell and every tab is still at least 44 px tall.',
    'Nothing scrolls sideways.',
  ],
};

export default scenario;
