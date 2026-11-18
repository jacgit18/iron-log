import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-326', feature: 'Nutrition meal labels and repeat', title: 'Skip this day only removes one day of a repeat', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat', edge: true,
  steps: [
    'Open Nutrition and repeat a planned card on Weekdays (Repeat…, Weekdays, Repeat). Go to the next week.',
    'On the Wednesday of that week, tap the repeated card and press "Repeat…", then press "Skip this day only".',
    'Look at Tuesday and Thursday of the same week, and at Wednesday of the week after.',
  ],
  expected: [
    'The status line reads "<food> is skipped on <day> only." and the sheet closes.',
    'The food is gone from that Wednesday but still shows on Tuesday and Thursday.',
    'Wednesday of the week after still shows the food.',
  ],
};

export default scenario;
