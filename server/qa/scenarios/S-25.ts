import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-25', feature: 'Recipe servings', title: 'Estimate grams with no gram amounts', persona: 'recipe-collector', brief: 'recipe-serving-size', edge: true,
  steps: [
    'Edit a recipe whose amounts are in cups, spoons or pieces and press Estimate from ingredients.',
  ],
  expected: [
    'It says no ingredient has an amount in grams and fills nothing.',
  ],
};

export default scenario;
