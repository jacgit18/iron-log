import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-176', feature: 'Used as', title: 'The chips follow the category until pressed; one always stays on, Drink stands alone', persona: 'recipe-collector', brief: 'recipes-used-as-ingredients-tab', edge: true,
  steps: [
    'Open + New, Recipe or meal. Change the category to Sauces, then to Carbs, and read Used as each time.',
    'Press Meal to turn it off, then change the category to Sauces again.',
    'On + New, Add a food, press Ready to eat off, then press Drink, then press Ingredient.',
  ],
  expected: [
    'Sauces gives Ingredient only; Carbs gives Meal and Ingredient. Once you press a chip the category stops changing it.',
    'The last chip cannot be turned off. Drink turns the others off, and pressing Ingredient afterwards turns Drink off.',
  ],
};

export default scenario;
