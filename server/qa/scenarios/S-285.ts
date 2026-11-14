import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-285', feature: 'Saved meals removal', title: 'Saved meals come from Recipes only, and a planned meal whose recipe is gone shows as removed', persona: 'meal-planner', brief: 'saved-meals-removal',
  steps: [
    'Open Recipes, Meals and rename "Chicken bowl" to "Chicken bowl 2". Open Nutrition, + Add food, Saved meals and read the list.',
    'Plan "Quick dinner" for a day ahead, then delete the Quick dinner meal in Recipes (More actions, Delete).',
    'Open that day on the Nutrition board and the planner.',
  ],
  expected: [
    'Saved meals lists the Recipes meals, with the new name; there is no separate old list or "waiting" note.',
    'The planned item is on the day ahead until the meal is deleted.',
    'After the delete the planned item shows the existing removed state, not a crash, and Remove clears it.',
  ],
};

export default scenario;
