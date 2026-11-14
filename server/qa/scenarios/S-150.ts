import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-150', feature: 'Food type', title: 'Nothing to review, and a food edited later', persona: 'diet-fresh', brief: 'food-type-and-migration', edge: true,
  steps: [
    'With no ready-made foods open Recipes. Then add one food and, from its Edit form, change its Used as from Ready to eat to Ingredient and save.',
  ],
  expected: [
    'There is no banner and no Review types button. The edited food keeps Ingredient when it is opened again.',
  ],
};

export default scenario;
