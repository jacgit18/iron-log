import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-248', feature: 'Nutrition week', title: 'Week arrows run Sunday to Saturday, with This week', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Press Reset on Meal planner first (switch to another account to do it), then switch back.',
    'Open Daily, Nutrition. Press the previous-week arrow, then the next-week arrow twice, then This week.',
  ],
  expected: [
    'Each week runs Sunday to Saturday like the Board; the arrows step one week at a time and This week returns to the current one.',
    'No visible "Nutrition" heading sits above the switcher (the Daily tab already says it; screen readers still get one).',
  ],
};

export default scenario;
