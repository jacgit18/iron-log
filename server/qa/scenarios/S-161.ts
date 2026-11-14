import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-161', feature: 'Meals from foods', title: 'Delete or rename a linked food; a part with no numbers is named', persona: 'recipe-collector', brief: 'meals-from-foods', edge: true,
  steps: [
    'Rename Whole milk to Milk and open Cereal bowl. Then press + New, Recipe or meal, name it Mystery, type one ingredient (a pinch of something) and no calories, and Save. Open Cereal bowl, press Edit, press + Food or meal, pick Mystery, and look at the counted line (a food added by hand needs calories, so it cannot be the one with no numbers). Finally delete Milk from Recipes (More actions, Delete, then Tap again to delete) and open the bowl.',
  ],
  expected: [
    'The bowl lists the new name Milk. The counted line says 2 of 3 ingredients counted, needs numbers: followed by the food\'s name. After Milk is deleted the line stays as plain text, is no longer a link, and the bowl\'s numbers drop to the parts that are left.',
  ],
};

export default scenario;
