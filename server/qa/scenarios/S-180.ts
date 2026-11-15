import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-180', feature: 'Goes with', title: 'Make a meal from a pair (after S-179): numbers add up, and deleting a recipe clears the pairing', persona: 'meal-planner', brief: 'recipes-goes-with',
  steps: [
    'With Chili and Rice paired (S-179), open Chili and press Make a meal.',
    'Read the new page, then open Recipes, press Meals and find it.',
    'Delete Rice (More actions, Delete, then Tap again to delete), then open Chili and read Goes with. Press Undo on the notice and read it again.',
  ],
  expected: [
    'A meal "Chili with Rice" opens at 1 serving with 600 kcal and 34 g protein per portion, rolled up from its two parts, and it is in the Meals tab.',
    'After Delete, Chili\'s Goes with no longer lists Rice. Undo brings the pairing back.',
  ],
};

export default scenario;
