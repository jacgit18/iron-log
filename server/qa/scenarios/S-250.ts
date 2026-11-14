import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-250', feature: 'Nutrition week', title: 'The toolbar offers what the selected day can do', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Press Reset on Meal planner first (switch to another account to do it), then switch back.',
    'Read the toolbar on today, then tap an earlier day and a day ahead and read it each time. On a window 1440 px or wider count the day columns.',
  ],
  expected: [
    'Today and an earlier day offer Scan and log, Quick add and One-off food (they log eaten food), with Add food as the last button; a day ahead offers Recipes and Saved meals (it plans, never logs).',
    'Seven columns show from 1440 px wide, and the selected day is clearly marked.',
  ],
};

export default scenario;
