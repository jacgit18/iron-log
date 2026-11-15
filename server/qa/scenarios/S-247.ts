import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-247', feature: 'Ingredient day line', title: 'Nothing ticked yet, a day with no record, and a phone', persona: 'supplement-stack', brief: 'ingredient-day-bars', edge: true,
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'On Nutrition open an earlier day with no ticks, then untick every supplement today.',
    'Resize to 375 px wide.',
  ],
  expected: [
    'With limits set, any day with nothing ticked (an earlier day, or today after unticking) reads "nothing ticked yet"; with no limits set there is no line.',
    'At 375 px there is no sideways scroll and the bars stay readable.',
  ],
};

export default scenario;
