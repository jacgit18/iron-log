import type { Scenario } from '../scenarios.ts';

// ---- Recipe nutrition ----
const scenario: Scenario = {
  id: 'S-21', feature: 'Recipe nutrition', title: 'Nutrition badges and the two filter chips', persona: 'recipe-collector', brief: 'recipe-nutrition-badges',
  steps: [
    'Open Recipes (Mine) and read the rows.',
    'Turn on High protein, then turn it off and turn on Under 500 kcal.',
    'Turn both on together, and add a category chip.',
  ],
  expected: [
    'Each row shows "N kcal · N g protein" when it has numbers.',
    'High protein lists only 30 g or more; Under 500 kcal lists only strictly under 500; both together and with a category use AND.',
  ],
};

export default scenario;
