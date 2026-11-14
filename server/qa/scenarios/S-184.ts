import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-184', feature: 'Saved meals move', title: 'Saved meals lists the Recipes meals and one tap logs one', persona: 'meal-planner', brief: 'saved-meals-into-recipes',
  steps: [
    'Open Nutrition, press Add food, then Saved meals and read the list. Tap "Usual breakfast".',
    'Look for a Manage button, then open Recipes and rename the meal there.',
  ],
  expected: [
    'The list shows the four meals. "Usual breakfast" reads "· 2 foods ·" and one tap adds two entries (the scramble and the oats). The other three read "· 1 food ·" and one tap adds one entry with the meal\'s total, because they were made of hand-typed foods.',
    'There is no Manage button; a note says to rename or edit a meal in Recipes. The new name shows in Saved meals.',
  ],
};

export default scenario;
