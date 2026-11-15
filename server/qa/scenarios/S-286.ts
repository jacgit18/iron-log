import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-286', feature: 'Saved meals removal', title: 'With Recipes full, the old saved meals stay and a note says to make room', persona: 'recipes-full', brief: 'saved-meals-removal', edge: true,
  steps: [
    'Sign in to this account on QA, open Recipes and read the count, then open Nutrition, + Add food and Saved meals.',
    'Read the note on the list, then tap "Chicken bowl".',
    'Delete one recipe in Recipes, reload the app and open Saved meals again.',
  ],
  expected: [
    'Recipes holds 300 recipes, so the four saved meals could not move into it.',
    'The old list is still offered with a note: "Some saved meals are waiting because Recipes is full (300 recipes). Delete a recipe to make room in Recipes and they move in the next time the app opens." One tap logs the meal as before.',
    'After one delete and a reload exactly one saved meal (Usual breakfast, the first) has moved into Recipes, which is full again; Chicken bowl, Post-workout and Quick dinner stay listed with the note.',
  ],
};

export default scenario;
