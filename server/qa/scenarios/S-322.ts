import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-322', feature: 'Nutrition meal labels and repeat', title: 'Tapping the week name on a desktop lists every week in a dropdown', persona: 'meal-planner', brief: 'nutrition-meal-labels-year-repeat',
  steps: [
    'On a desktop window wider than 700 px, open Nutrition.',
    'Press the week name in the week row (it reads This week).',
    'In the list under it, find the "Coming up" group and press "In 3 weeks" (its dates are part of its name).',
    'Press the Previous week arrow once, then press "This week".',
  ],
  expected: [
    'A dropdown titled Choose a week opens under the week name with two groups, "Earlier" (above) and "Coming up" (below), and a tick on the week you are in.',
    'The board shows the week named "In 3 weeks" and the dropdown closes.',
    'The Previous week arrow moves to "In 2 weeks"; "This week" takes you back to the current week.',
    'The address in the browser bar does not change when you pick a week.',
  ],
};

export default scenario;
