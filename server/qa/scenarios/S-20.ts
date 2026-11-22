import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-20', feature: 'Recipe-first log', title: 'New ready-made food', persona: 'diet-fresh', brief: 'recipe-first-diet-log',
  steps: [
    'Open Recipes and press + New, then Add a food.',
    'Save it with only a name; then add 250 kcal and 20 g protein and save.',
    'Find it under the Foods tab, open it and press Ate this.',
    'Edit the food to 300 kcal and look at the entry already logged.',
  ],
  expected: [
    'A name alone is refused; the form needs a name, calories and protein.',
    'The detail has no ingredients, steps, scaler or grocery buttons; Ate this logs a snapshot with its recipe link.',
    'The earlier entry keeps 250 kcal after the food changes.',
  ],
};

export default scenario;
