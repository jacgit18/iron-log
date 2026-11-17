import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-327', feature: 'Nutrition meal labels and repeat', title: 'Stop repeating removes every repeated day', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat', edge: true,
  steps: [
    'Open Nutrition and repeat a planned card on Every day (Repeat…, Every day, Repeat).',
    'Go to the next week, tap the repeated card and press "Repeat…".',
    'Press "Stop repeating", then press "Tap again to stop".',
    'Look at several days of that week and of the week after, then go back to the day you first repeated.',
  ],
  expected: [
    'The sheet for an existing repeat shows Skip this day only, Stop repeating, Cancel and Save (not Repeat).',
    'The status line reads "<food> no longer repeats." and the sheet closes.',
    'The repeated food is gone from every later day; the card you first planned on its own day is still there.',
  ],
};

export default scenario;
