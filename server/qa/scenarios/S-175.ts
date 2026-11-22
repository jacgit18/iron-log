import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-175', feature: 'Used as', title: 'One food with two labels shows in both tabs', persona: 'diet-fresh', brief: 'recipes-used-as-ingredients-tab',
  steps: [
    'Open Recipes, press + New, Add a food by hand. Name it Eggs, 70 calories and 6 g protein. Look at the Used as chips, press Ingredient too, and Save food.',
    'Go Back and press the Foods tab, then the Ingredients tab.',
  ],
  expected: [
    'Used as starts on Ready to eat and takes a second chip. The row tag reads Ingredient + Ready to eat.',
    'Eggs is in Foods and in Ingredients, with a Log button on its row.',
  ],
};

export default scenario;
