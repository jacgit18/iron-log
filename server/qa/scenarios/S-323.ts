import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-323', feature: 'Nutrition meal labels and repeat', title: 'Tapping the week name on a phone opens the Choose a week sheet', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat', device: true,
  steps: [
    'On a phone, open Nutrition.',
    'Press the week name in the week row (it reads This week).',
    'In the sheet, press "Next week" in the "Coming up" group.',
    'Press the week name again, then press Close.',
  ],
  expected: [
    'A bottom sheet titled Choose a week opens with "Earlier" and "Coming up" groups, the current week ticked and scrolled into view.',
    'The sheet closes and the board shows Next week.',
    'Close shuts the sheet and leaves the week as it was.',
  ],
};

export default scenario;
