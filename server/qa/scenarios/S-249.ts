import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-249', feature: 'Nutrition week', title: 'A planned food on today has a check box that logs it as eaten', persona: 'meal-planner', brief: 'nutrition-board',
  steps: [
    'Press Reset on Meal planner first (switch to another account to do it), then switch back.',
    'On Nutrition, today, tick the check box on a planned food, read the meters and the eaten rows, then untick it.',
  ],
  expected: [
    'Ticking logs the food as eaten and the meters move; unticking removes that log.',
    'A separate eaten row appears only for food that was not planned.',
  ],
};

export default scenario;
