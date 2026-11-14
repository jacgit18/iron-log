import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-246', feature: 'Ingredient day line', title: 'A closed line under the Supplements meter names the two nearest their limits', persona: 'supplement-stack', brief: 'ingredient-day-bars',
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'Open Daily, Nutrition, today. Under the Supplements meter read the line that starts "Active ingredients:".',
    'Press the line, then press Open Totals.',
  ],
  expected: [
    'The line reads like "Active ingredients: Omega-3 over · EPA Met", naming the two nearest their limits; Creatine, with no limit, has no line.',
    'Pressing it opens thin bars (up to five), each carrying the Totals sentence, and Open Totals shows the same figures.',
  ],
};

export default scenario;
