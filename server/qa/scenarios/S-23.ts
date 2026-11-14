import type { Scenario } from '../scenarios.ts';

// ---- Recipe servings ----
const scenario: Scenario = {
  id: 'S-23', feature: 'Recipe servings', title: 'Scale a recipe by servings', persona: 'recipe-collector', brief: 'recipe-servings-scaling',
  steps: [
    'Edit a recipe with 2 servings and note its amounts (for example "1 cup").',
    'Double the Servings, then set them back.',
    'Double them again and Save; reload and reopen the recipe.',
    'Open the recipe view and change its servings control, then leave and return.',
  ],
  expected: [
    'Amounts double at once ("1 cup" becomes "2 cup"), return to the original text when servings return, and persist after Save and reload.',
    'The view page\'s servings control shows scaled amounts, saves nothing, and resets on leaving.',
  ],
};

export default scenario;
