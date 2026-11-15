import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-220', feature: 'Supplement portions', title: 'Twice a day with a different amount each time', persona: 'meal-planner', brief: 'supplement-portions',
  steps: [
    'With the supplement from the last scenario, add it to Night on the Supplements tab, then open its Night entry and press − until it says "1 capsule". Save.',
    'Tick Morning and Night today and read the Totals magnesium figure; then edit the nutrient rows on the Night entry (change 200 mg to 300 mg) and open the Morning entry.',
  ],
  expected: [
    'A copy added to another section starts at one serving; after the change Morning shows its own amount and Night shows "1 capsule".',
    'The Totals figure is the Morning amount plus the Night amount. The Morning entry now shows the same rows (300 mg) and serving size as Night, while its capsule count is unchanged.',
  ],
};

export default scenario;
