import type { Scenario } from '../scenarios.ts';

// ---- Food type ----
const scenario: Scenario = {
  id: 'S-148', feature: 'Food type', title: 'Pick a Type on a new ready-made food', persona: 'diet-fresh', brief: 'food-type-and-migration',
  steps: [
    'Open Recipes and press + New, then Add a food. Look at the Used as chips, press Drink, name it Goat milk kefir, type 150 calories and 8 protein, and press Save food.',
    'Open the food and press Edit.',
  ],
  expected: [
    'Used as starts on Ready to eat; Drink turns it off. The food saves with no banner about types.',
    'The form opens with Drink picked.',
  ],
};

export default scenario;
