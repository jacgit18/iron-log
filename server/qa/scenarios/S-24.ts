import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-24', feature: 'Recipe servings', title: 'Serving size text and grams', persona: 'recipe-collector', brief: 'recipe-serving-size',
  steps: [
    'Edit a recipe. Enter Serving size "1 bowl" and Grams per serving 250, then Save.',
    'Open the recipe detail.',
    'Change the recipe\'s Servings and look at the serving size.',
  ],
  expected: [
    'The detail reads "Serving size: 1 bowl (250 g)".',
    'Changing Servings leaves the text and the grams per serving as they were.',
  ],
};

export default scenario;
