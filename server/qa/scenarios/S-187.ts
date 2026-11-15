import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-187', feature: 'Week board', title: 'Plan opens as the Board on a wide screen and the List on a phone (retired 2026-11-09: the Plan List and Board switch was removed by the Nutrition board)', persona: 'meal-planner', brief: 'week-board', retired: true,
  steps: [
    'On a desktop browser open Nutrition and find Plan. Press List, then Board.',
    'On a phone open Nutrition, Plan. Press Board.',
  ],
  expected: [
    'On a wide screen the Board is shown first: seven days side by side. The List is the plan you knew, unchanged.',
    'On a phone the List is shown first, and the Board shows one day at a time with a row of day buttons.',
  ],
};

export default scenario;
