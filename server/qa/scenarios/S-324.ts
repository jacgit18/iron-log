import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-324', feature: 'Nutrition meal labels and repeat', title: 'The week list stops 52 weeks ahead and at the oldest logged week', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat', edge: true,
  steps: [
    'On a desktop window, open Nutrition and press the week name.',
    'Scroll to the bottom of the "Coming up" group, press "In 52 weeks", then press the Next week arrow.',
    'Press the week name again and scroll to the top of the "Earlier" group, press the oldest week listed, then press the Previous week arrow.',
  ],
  expected: [
    'The last row in "Coming up" is "In 52 weeks"; there is no "In 53 weeks".',
    'On "In 52 weeks" the Next week arrow does nothing (it stays dimmed) and the board stays on that week.',
    'The "Earlier" group ends at the week of the oldest logged day (at least Last week); on that week the Previous week arrow does nothing.',
  ],
};

export default scenario;
