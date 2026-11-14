import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-243', feature: 'Active ingredients', title: 'Ingredient rows on a supplement, and one with none behaves as before', persona: 'supplement-stack', brief: 'supplement-active-ingredients',
  steps: [
    'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
    'In Manage press Edit on Fish oil and look at its rows below the vitamin and mineral rows.',
    'Press Edit on Multivitamin.',
  ],
  expected: [
    'Fish oil lists Omega-3 1,000 mg, EPA 300 mg and DHA 200 mg per serving, and the nutrient picker offers all 28 nutrients grouped under headings.',
    'Multivitamin has no ingredient rows and saves and totals exactly as it did before.',
  ],
};

export default scenario;
